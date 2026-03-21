'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  playNodeClick,
  playPathSegment,
  playPuzzleComplete,
  playAccessGranted,
  startAmbientDrone,
  stopAmbientDrone,
} from '@/lib/hackingAudio';
import './HackingMiniGame.css';

// ─── Types ──────────────────────────────────────────────────────────────

interface Node {
  id: number;
  row: number;
  col: number;
  type: 'source' | 'target' | 'relay';
}

interface Edge {
  a: number;
  b: number;
}

interface GridData {
  nodes: Node[];
  edges: Edge[];
  rows: number;
  cols: number;
  adj: Map<number, number[]>;
}

interface HackingMiniGameProps {
  apiResolved: boolean;
  apiError: boolean;
  packName: string;
  onComplete: () => void;
  onError: () => void;
}

// ─── Grid Generation ────────────────────────────────────────────────────

function generateGrid(rows: number, cols: number): GridData {
  const nodes: Node[] = [];
  let id = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      nodes.push({ id: id++, row: r, col: c, type: 'relay' });
    }
  }

  // Pick source (left half) and target (right half)
  const leftHalf = nodes.filter(n => n.col < Math.ceil(cols / 2));
  const rightHalf = nodes.filter(n => n.col >= Math.floor(cols / 2));

  const sourceNode = leftHalf[Math.floor(Math.random() * leftHalf.length)];
  let targetNode = rightHalf[Math.floor(Math.random() * rightHalf.length)];

  if (sourceNode.id === targetNode.id) {
    const alternatives = rightHalf.filter(n => n.id !== sourceNode.id);
    if (alternatives.length > 0) {
      targetNode = alternatives[Math.floor(Math.random() * alternatives.length)];
    }
  }

  nodes[sourceNode.id].type = 'source';
  nodes[targetNode.id].type = 'target';

  // Generate all potential edges (horizontal + vertical adjacency)
  const potentialEdges: Edge[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const nodeId = r * cols + c;
      if (c + 1 < cols) potentialEdges.push({ a: nodeId, b: nodeId + 1 });
      if (r + 1 < rows) potentialEdges.push({ a: nodeId, b: nodeId + cols });
    }
  }

  // Shuffle
  for (let i = potentialEdges.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [potentialEdges[i], potentialEdges[j]] = [potentialEdges[j], potentialEdges[i]];
  }

  // BFS to find guaranteed path
  const fullAdj = new Map<number, number[]>();
  for (const n of nodes) fullAdj.set(n.id, []);
  for (const e of potentialEdges) {
    fullAdj.get(e.a)!.push(e.b);
    fullAdj.get(e.b)!.push(e.a);
  }

  const pathEdges = new Set<string>();
  const path = bfsPath(fullAdj, sourceNode.id, targetNode.id);
  if (path) {
    for (let i = 0; i < path.length - 1; i++) {
      const a = Math.min(path[i], path[i + 1]);
      const b = Math.max(path[i], path[i + 1]);
      pathEdges.add(`${a}-${b}`);
    }
  }

  // Select edges: always include path edges, randomly include ~50% of others
  const edges: Edge[] = [];
  const edgeKeepRate = 0.4 + Math.random() * 0.25;

  for (const e of potentialEdges) {
    const key = `${Math.min(e.a, e.b)}-${Math.max(e.a, e.b)}`;
    if (pathEdges.has(key)) {
      edges.push(e);
    } else if (Math.random() < edgeKeepRate) {
      edges.push(e);
    }
  }

  // Build adjacency from selected edges
  const adj = new Map<number, number[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    adj.get(e.a)!.push(e.b);
    adj.get(e.b)!.push(e.a);
  }

  return { nodes, edges, rows, cols, adj };
}

function bfsPath(adj: Map<number, number[]>, start: number, end: number): number[] | null {
  const visited = new Set<number>();
  const queue: number[][] = [[start]];
  visited.add(start);

  while (queue.length > 0) {
    const currentPath = queue.shift()!;
    const current = currentPath[currentPath.length - 1];
    if (current === end) return currentPath;
    for (const neighbor of adj.get(current) || []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...currentPath, neighbor]);
      }
    }
  }
  return null;
}

function findHintNode(adj: Map<number, number[]>, current: number, target: number, visited: Set<number>): number | null {
  const seen = new Set<number>(visited);
  seen.delete(current);
  seen.delete(target);
  const queue: number[][] = [[current]];
  seen.add(current);

  while (queue.length > 0) {
    const p = queue.shift()!;
    const c = p[p.length - 1];
    if (c === target) return p.length > 1 ? p[1] : null;
    for (const nb of adj.get(c) || []) {
      if (!seen.has(nb)) {
        seen.add(nb);
        queue.push([...p, nb]);
      }
    }
  }
  return null;
}

// ─── Component ──────────────────────────────────────────────────────────

export function HackingMiniGame({
  apiResolved,
  apiError,
  packName,
  onComplete,
  onError,
}: HackingMiniGameProps) {
  const [phase, setPhase] = useState<'intro' | 'playing' | 'completing' | 'access-granted'>('intro');
  const [grid, setGrid] = useState<GridData | null>(null);
  const [puzzleCount, setPuzzleCount] = useState(0);

  // Player position (node ID the player block is on)
  const [playerPos, setPlayerPos] = useState<number>(-1);
  const [tracePath, setTracePath] = useState<number[]>([]);
  const [activeEdges, setActiveEdges] = useState<Set<string>>(new Set());
  const [traceStarted, setTraceStarted] = useState(false);

  const [flashNodes, setFlashNodes] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [statusKey, setStatusKey] = useState(0);
  const [cascadePhase, setCascadePhase] = useState(false);
  const [gridAnimClass, setGridAnimClass] = useState('hacking-grid-enter');
  const [hintNodeId, setHintNodeId] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [pressedKey, setPressedKey] = useState<string | null>(null);

  const [fakeIp] = useState(() =>
    `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
  );

  const apiResolvedRef = useRef(apiResolved);
  const hintTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hintGivenRef = useRef(false);
  const gridRef = useRef<GridData | null>(null);
  const phaseRef = useRef(phase);
  const tracePathRef = useRef(tracePath);
  const playerPosRef = useRef(playerPos);
  const traceStartedRef = useRef(traceStarted);

  useEffect(() => { apiResolvedRef.current = apiResolved; }, [apiResolved]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { tracePathRef.current = tracePath; }, [tracePath]);
  useEffect(() => { playerPosRef.current = playerPos; }, [playerPos]);
  useEffect(() => { traceStartedRef.current = traceStarted; }, [traceStarted]);

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Grid size calculator
  const getGridSize = useCallback(() => {
    const maxSize = isMobile ? 5 : 7;
    const baseSize = 4;
    const growth = Math.floor(puzzleCount / 2);
    return Math.min(baseSize + growth, maxSize);
  }, [puzzleCount, isMobile]);

  // Initialize a new puzzle
  const initPuzzle = useCallback((count: number) => {
    const maxSize = isMobile ? 5 : 7;
    const baseSize = 4;
    const growth = Math.floor(count / 2);
    const size = Math.min(baseSize + growth, maxSize);
    const newGrid = generateGrid(size, size);
    setGrid(newGrid);
    gridRef.current = newGrid;

    // Place player on the source node
    const src = newGrid.nodes.find(n => n.type === 'source')!;
    setPlayerPos(src.id);
    setTracePath([src.id]);
    setTraceStarted(true);
    setActiveEdges(new Set());
    setHintNodeId(null);
    hintGivenRef.current = false;
    setGridAnimClass('hacking-grid-enter');
    setPhase('playing');
  }, [isMobile]);

  // ── Intro phase ──
  useEffect(() => {
    startAmbientDrone();
    const timer = setTimeout(() => {
      initPuzzle(0);
    }, 1500);
    return () => {
      clearTimeout(timer);
      stopAmbientDrone();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handle API error ──
  useEffect(() => {
    if (apiError) {
      stopAmbientDrone();
      onError();
    }
  }, [apiError, onError]);

  // ── Hint timer ──
  useEffect(() => {
    if (phase === 'playing' && apiResolved && grid && traceStarted) {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      hintTimerRef.current = setTimeout(() => {
        if (!hintGivenRef.current && gridRef.current) {
          const g = gridRef.current;
          const targetNode = g.nodes.find(n => n.type === 'target');
          if (targetNode) {
            const visitedSet = new Set(tracePathRef.current);
            const hint = findHintNode(g.adj, playerPosRef.current, targetNode.id, visitedSet);
            if (hint !== null) {
              setHintNodeId(hint);
              hintGivenRef.current = true;
              setTimeout(() => setHintNodeId(null), 2500);
            }
          }
        }
      }, 20000);
    }
    return () => { if (hintTimerRef.current) clearTimeout(hintTimerRef.current); };
  }, [phase, apiResolved, grid, traceStarted, playerPos]);

  // ── Puzzle completion ──
  const handlePuzzleComplete = useCallback(() => {
    setPhase('completing');
    setFlashNodes(true);
    playPuzzleComplete();
    setStatusText('Node Secured');
    setStatusKey(prev => prev + 1);

    const shouldExit = apiResolvedRef.current;

    setTimeout(() => {
      setFlashNodes(false);

      if (shouldExit) {
        setCascadePhase(true);
        playAccessGranted();
        stopAmbientDrone();

        setTimeout(() => {
          setPhase('access-granted');
          setStatusText('ACCESS GRANTED');
          setStatusKey(prev => prev + 1);
        }, 600);

        setTimeout(() => {
          onComplete();
        }, 2200);
      } else {
        setGridAnimClass('hacking-grid-dissolve');
        setTimeout(() => {
          const newCount = puzzleCount + 1;
          setPuzzleCount(newCount);
          initPuzzle(newCount);
        }, 350);
      }
    }, 600);
  }, [puzzleCount, onComplete, initPuzzle]);

  // ── Movement handler ──
  const movePlayer = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    if (phaseRef.current !== 'playing' || !gridRef.current) return;

    const g = gridRef.current;
    const currentPos = playerPosRef.current;
    const currentNode = g.nodes[currentPos];
    if (!currentNode) return;

    // Calculate target position
    let targetRow = currentNode.row;
    let targetCol = currentNode.col;

    switch (direction) {
      case 'up': targetRow--; break;
      case 'down': targetRow++; break;
      case 'left': targetCol--; break;
      case 'right': targetCol++; break;
    }

    // Bounds check
    if (targetRow < 0 || targetRow >= g.rows || targetCol < 0 || targetCol >= g.cols) return;

    const targetId = targetRow * g.cols + targetCol;
    const neighbors = g.adj.get(currentPos) || [];

    // Check if there's a connection
    if (!neighbors.includes(targetId)) return;

    const currentTrace = tracePathRef.current;

    // Backtracking: moving back to the previous node in trace
    if (currentTrace.length >= 2 && currentTrace[currentTrace.length - 2] === targetId) {
      playNodeClick();
      const newPath = currentTrace.slice(0, -1);
      setTracePath(newPath);
      tracePathRef.current = newPath;
      const edgeKey = `${Math.min(currentPos, targetId)}-${Math.max(currentPos, targetId)}`;
      setActiveEdges(prev => {
        const next = new Set(prev);
        next.delete(edgeKey);
        return next;
      });
      setPlayerPos(targetId);
      playerPosRef.current = targetId;
      setHintNodeId(null);
      return;
    }

    // Don't revisit nodes already in path
    if (currentTrace.includes(targetId)) return;

    // Valid forward move
    playNodeClick();
    playPathSegment();
    const edgeKey = `${Math.min(currentPos, targetId)}-${Math.max(currentPos, targetId)}`;
    const newPath = [...currentTrace, targetId];
    setTracePath(newPath);
    tracePathRef.current = newPath;
    setActiveEdges(prev => new Set(prev).add(edgeKey));
    setPlayerPos(targetId);
    playerPosRef.current = targetId;
    setHintNodeId(null);

    // Check if target reached
    const targetNode = g.nodes[targetId];
    if (targetNode && targetNode.type === 'target') {
      handlePuzzleComplete();
    }
  }, [handlePuzzleComplete]);

  // ── Keyboard Input ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      let dir: 'up' | 'down' | 'left' | 'right' | null = null;
      let keyLabel: string | null = null;

      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W':
          dir = 'up'; keyLabel = 'W'; break;
        case 'ArrowDown': case 's': case 'S':
          dir = 'down'; keyLabel = 'S'; break;
        case 'ArrowLeft': case 'a': case 'A':
          dir = 'left'; keyLabel = 'A'; break;
        case 'ArrowRight': case 'd': case 'D':
          dir = 'right'; keyLabel = 'D'; break;
      }

      if (dir) {
        e.preventDefault();
        setPressedKey(keyLabel);
        movePlayer(dir);
      }
    };

    const handleKeyUp = () => {
      setPressedKey(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [movePlayer]);

  // ── Mobile touch controls ──
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (Math.max(absDx, absDy) < 20) return; // Too small

    if (absDx > absDy) {
      movePlayer(dx > 0 ? 'right' : 'left');
    } else {
      movePlayer(dy > 0 ? 'down' : 'up');
    }
    touchStartRef.current = null;
  }, [movePlayer]);

  // ── Compute node positions ──
  const getNodePos = useCallback((node: Node, gridData: GridData) => {
    const padding = 0.1;
    const x = padding + (node.col / Math.max(gridData.cols - 1, 1)) * (1 - 2 * padding);
    const y = padding + (node.row / Math.max(gridData.rows - 1, 1)) * (1 - 2 * padding);
    return { x: x * 100, y: y * 100 };
  }, []);

  const nodeSize = isMobile ? 5 : 4;
  const playerSize = nodeSize + 1.5;

  // Data collected percentage (based on puzzles solved, roughly)
  const dataPercent = Math.min((puzzleCount / 6) * 100, 95);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div
      className="hacking-container"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* CRT Monitor Frame */}
      <div className="hacking-monitor">
        {/* Scanlines */}
        <div className="hacking-scanlines" />
        {/* Vignette */}
        <div className="hacking-vignette" />

        {/* Corner Readouts */}
        <div className="hacking-readout top-left">
          TARGET: api.github.com<br />
          PROTOCOL: HTTPS/2
        </div>
        <div className="hacking-readout top-right">
          PACK TYPE: {packName}<br />
          STATUS: {apiResolved ? 'DATA RECEIVED' : 'FETCHING...'}
        </div>
        <div className="hacking-readout bottom-left">
          {fakeIp} │ {phase === 'access-granted' ? 'TERMINATED' : 'CONNECTED'}
        </div>
        <div className="hacking-readout bottom-right">
          NODES SECURED: {puzzleCount}<br />
          GRID: {grid ? `${grid.rows}×${grid.cols}` : '---'}
        </div>

        {/* Status Text */}
        {statusText && (
          <div key={statusKey} className="hacking-status">
            {statusText}
          </div>
        )}

        {/* Intro Phase */}
        {phase === 'intro' && (
          <div className="hacking-intro">
            <div className="hacking-intro-text">
              Infiltrating GitHub servers…
            </div>
            <div className="hacking-intro-sub">
              Route the signal to extract your developers
            </div>
          </div>
        )}

        {/* ACCESS GRANTED Overlay */}
        {phase === 'access-granted' && (
          <div className="hacking-access-granted">
            <div className="hacking-access-text">
              ACCESS GRANTED
            </div>
          </div>
        )}

        {/* Grid */}
        {grid && phase !== 'intro' && phase !== 'access-granted' && (
          <div className={`hacking-grid-area ${gridAnimClass}`}>
            <svg className="hacking-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
              {/* Edges */}
              {grid.edges.map((edge, i) => {
                const nodeA = grid.nodes[edge.a];
                const nodeB = grid.nodes[edge.b];
                const posA = getNodePos(nodeA, grid);
                const posB = getNodePos(nodeB, grid);
                const edgeKey = `${Math.min(edge.a, edge.b)}-${Math.max(edge.a, edge.b)}`;
                const isActive = activeEdges.has(edgeKey);
                const isFlash = flashNodes || cascadePhase;

                return (
                  <g key={`edge-${i}`}>
                    <line
                      x1={posA.x} y1={posA.y}
                      x2={posB.x} y2={posB.y}
                      className={`hacking-edge ${isFlash ? 'flash' : isActive ? 'active' : ''}`}
                    />
                    {isActive && !isFlash && (
                      <line
                        x1={posA.x} y1={posA.y}
                        x2={posB.x} y2={posB.y}
                        className="hacking-edge-flow"
                      />
                    )}
                  </g>
                );
              })}

              {/* Node Squares */}
              {grid.nodes.map(node => {
                const pos = getNodePos(node, grid);
                const isInPath = tracePath.includes(node.id);
                const isFlashing = flashNodes || cascadePhase;
                const isHinted = hintNodeId === node.id;

                let className = 'hacking-node';
                if (node.type === 'source') className += ' source';
                else if (node.type === 'target') className += ' target';
                else className += ` relay${isInPath ? ' active' : ''}`;
                if (isFlashing) className += ' flash';
                if (isHinted && !isInPath) className += ' hint';

                return (
                  <g key={`node-${node.id}`}>
                    <rect
                      x={pos.x - nodeSize / 2}
                      y={pos.y - nodeSize / 2}
                      width={nodeSize}
                      height={nodeSize}
                      rx={0.5}
                      className={className}
                      onClick={() => {
                        // On mobile: clicking nodes directly as fallback
                        if (!isMobile) return;
                        const neighbors = grid.adj.get(playerPos) || [];
                        if (neighbors.includes(node.id)) {
                          // Determine direction
                          const pn = grid.nodes[playerPos];
                          if (node.row < pn.row) movePlayer('up');
                          else if (node.row > pn.row) movePlayer('down');
                          else if (node.col < pn.col) movePlayer('left');
                          else if (node.col > pn.col) movePlayer('right');
                        }
                      }}
                    />
                    {/* Source icon */}
                    {node.type === 'source' && (
                      <text x={pos.x} y={pos.y} className="hacking-icon-text" style={{ fill: '#ff8c00' }}>
                        SRC
                      </text>
                    )}
                    {/* Target icon */}
                    {node.type === 'target' && (
                      <text x={pos.x} y={pos.y} className="hacking-icon-text" style={{ fill: '#00e676' }}>
                        TGT
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Player Cursor Block */}
              {playerPos >= 0 && playerPos < grid.nodes.length && (
                (() => {
                  const pNode = grid.nodes[playerPos];
                  const pPos = getNodePos(pNode, grid);
                  return (
                    <g>
                      <rect
                        x={pPos.x - playerSize / 2}
                        y={pPos.y - playerSize / 2}
                        width={playerSize}
                        height={playerSize}
                        rx={0.8}
                        className="hacking-player"
                      />
                      <rect
                        x={pPos.x - 1}
                        y={pPos.y - 1}
                        width={2}
                        height={2}
                        rx={0.3}
                        className="hacking-player-inner"
                      />
                    </g>
                  );
                })()
              )}
            </svg>
          </div>
        )}

        {/* Bottom HUD */}
        <div className="hacking-hud">
          {/* Controls */}
          <div className="hacking-controls">
            <span className="hacking-hud-label">Move:</span>
            <div className={`hacking-key ${pressedKey === 'W' ? 'pressed' : ''}`}>W</div>
            <div className={`hacking-key ${pressedKey === 'A' ? 'pressed' : ''}`}>A</div>
            <div className={`hacking-key ${pressedKey === 'S' ? 'pressed' : ''}`}>S</div>
            <div className={`hacking-key ${pressedKey === 'D' ? 'pressed' : ''}`}>D</div>
          </div>

          {/* Data Collected */}
          <div className="hacking-data-bar-container">
            <span className="hacking-data-bar-label">Data Collected:</span>
            <div className="hacking-data-bar-track">
              <div
                className="hacking-data-bar-fill"
                style={{ width: `${apiResolved ? 100 : dataPercent}%` }}
              />
            </div>
          </div>

          {/* Nodes Counter */}
          <div className="hacking-hud-label">
            Nodes: {puzzleCount}
          </div>
        </div>
      </div>
    </div>
  );
}
