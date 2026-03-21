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

  // Create nodes
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      nodes.push({ id: id++, row: r, col: c, type: 'relay' });
    }
  }

  // Pick source (left half) and target (right half)
  const leftHalf = nodes.filter(n => n.col < Math.ceil(cols / 2));
  const rightHalf = nodes.filter(n => n.col >= Math.floor(cols / 2));
  const sourceNode = leftHalf[Math.floor(Math.random() * leftHalf.length)];
  const targetNode = rightHalf[Math.floor(Math.random() * rightHalf.length)];

  // Ensure source and target are different
  if (sourceNode.id === targetNode.id) {
    // Pick another target
    const alternatives = rightHalf.filter(n => n.id !== sourceNode.id);
    if (alternatives.length > 0) {
      const alt = alternatives[Math.floor(Math.random() * alternatives.length)];
      targetNode.id = alt.id;
      targetNode.row = alt.row;
      targetNode.col = alt.col;
    }
  }

  sourceNode.type = 'source';
  targetNode.type = 'target';
  nodes.find(n => n.id === sourceNode.id)!.type = 'source';
  nodes.find(n => n.id === targetNode.id)!.type = 'target';

  // Generate edges: consider all adjacent pairs (horizontal, vertical, diagonal optional)
  const potentialEdges: Edge[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const nodeId = r * cols + c;
      // Right neighbor
      if (c + 1 < cols) potentialEdges.push({ a: nodeId, b: nodeId + 1 });
      // Bottom neighbor
      if (r + 1 < rows) potentialEdges.push({ a: nodeId, b: nodeId + cols });
    }
  }

  // Shuffle edges
  for (let i = potentialEdges.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [potentialEdges[i], potentialEdges[j]] = [potentialEdges[j], potentialEdges[i]];
  }

  // First, build a guaranteed path from source to target using BFS on full grid
  const fullAdj: Map<number, number[]> = new Map();
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

  // Now select edges: always include path edges, randomly include others
  const edges: Edge[] = [];
  const edgeKeepRate = 0.45 + Math.random() * 0.2; // 45-65% of non-path edges

  for (const e of potentialEdges) {
    const key = `${Math.min(e.a, e.b)}-${Math.max(e.a, e.b)}`;
    if (pathEdges.has(key)) {
      edges.push(e);
    } else if (Math.random() < edgeKeepRate) {
      edges.push(e);
    }
  }

  return { nodes, edges, rows, cols };
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

// Find ONE valid next step for hint
function findHintNode(adj: Map<number, number[]>, current: number, target: number, visited: Set<number>): number | null {
  const path = bfsPathAvoid(adj, current, target, visited);
  if (path && path.length > 1) return path[1];
  return null;
}

function bfsPathAvoid(adj: Map<number, number[]>, start: number, end: number, visited: Set<number>): number[] | null {
  const seen = new Set<number>(visited);
  seen.delete(start);
  seen.delete(end);
  const queue: number[][] = [[start]];
  seen.add(start);

  while (queue.length > 0) {
    const currentPath = queue.shift()!;
    const current = currentPath[currentPath.length - 1];

    if (current === end) return currentPath;

    for (const neighbor of adj.get(current) || []) {
      if (!seen.has(neighbor)) {
        seen.add(neighbor);
        queue.push([...currentPath, neighbor]);
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
  const [tracePath, setTracePath] = useState<number[]>([]);
  const [activeEdges, setActiveEdges] = useState<Set<string>>(new Set());
  const [flashNodes, setFlashNodes] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [statusKey, setStatusKey] = useState(0);
  const [cascadePhase, setCascadePhase] = useState(false);
  const [gridAnimClass, setGridAnimClass] = useState('hacking-grid-enter');
  const [hintNodeId, setHintNodeId] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Track fake readout data
  const [fakeIp] = useState(() =>
    `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
  );

  const apiResolvedRef = useRef(apiResolved);
  const puzzleSolveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hintGivenRef = useRef(false);

  useEffect(() => {
    apiResolvedRef.current = apiResolved;
  }, [apiResolved]);

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Calculate grid size
  const getGridSize = useCallback(() => {
    const maxSize = isMobile ? 5 : 7;
    const baseSize = 4;
    const growth = Math.floor(puzzleCount / 2);
    const size = Math.min(baseSize + growth, maxSize);
    return { rows: size, cols: size };
  }, [puzzleCount, isMobile]);

  // ── Intro phase ──
  useEffect(() => {
    startAmbientDrone();

    const timer = setTimeout(() => {
      setPhase('playing');
      const { rows, cols } = getGridSize();
      setGrid(generateGrid(rows, cols));
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

  // ── Hint timer: if API resolved and player stalls >20s ──
  useEffect(() => {
    if (phase === 'playing' && apiResolved && grid && tracePath.length > 0) {
      hintGivenRef.current = false;

      if (puzzleSolveTimerRef.current) clearTimeout(puzzleSolveTimerRef.current);

      puzzleSolveTimerRef.current = setTimeout(() => {
        if (!hintGivenRef.current && tracePath.length > 0 && grid) {
          // Build adjacency for current grid
          const adj = buildAdj(grid);
          const currentNode = tracePath[tracePath.length - 1];
          const targetNode = grid.nodes.find(n => n.type === 'target');
          if (targetNode) {
            const visitedSet = new Set(tracePath);
            const hint = findHintNode(adj, currentNode, targetNode.id, visitedSet);
            if (hint !== null) {
              setHintNodeId(hint);
              hintGivenRef.current = true;
              // Remove hint after 2s
              setTimeout(() => setHintNodeId(null), 2000);
            }
          }
        }
      }, 20000);
    }

    return () => {
      if (puzzleSolveTimerRef.current) clearTimeout(puzzleSolveTimerRef.current);
    };
  }, [phase, apiResolved, grid, tracePath]);

  // Build adjacency map from grid edges
  const buildAdj = useCallback((g: GridData): Map<number, number[]> => {
    const adj = new Map<number, number[]>();
    for (const n of g.nodes) adj.set(n.id, []);
    for (const e of g.edges) {
      adj.get(e.a)!.push(e.b);
      adj.get(e.b)!.push(e.a);
    }
    return adj;
  }, []);

  // ── Handle node click ──
  const handleNodeClick = useCallback((nodeId: number) => {
    if (phase !== 'playing' || !grid) return;

    const node = grid.nodes.find(n => n.id === nodeId);
    if (!node) return;

    // If trace is empty, must click source
    if (tracePath.length === 0) {
      if (node.type !== 'source') return;
      playNodeClick();
      setTracePath([nodeId]);
      setHintNodeId(null);
      return;
    }

    const lastNode = tracePath[tracePath.length - 1];

    // Backtrack: clicking the previous node in trace
    if (tracePath.length >= 2 && tracePath[tracePath.length - 2] === nodeId) {
      playNodeClick();
      const newPath = tracePath.slice(0, -1);
      setTracePath(newPath);
      // Remove last edge
      const edgeKey = `${Math.min(lastNode, nodeId)}-${Math.max(lastNode, nodeId)}`;
      setActiveEdges(prev => {
        const next = new Set(prev);
        next.delete(edgeKey);
        return next;
      });
      setHintNodeId(null);
      return;
    }

    // Check adjacency
    const adj = buildAdj(grid);
    const neighbors = adj.get(lastNode) || [];
    if (!neighbors.includes(nodeId)) return;

    // Don't revisit (except backtrack handled above)
    if (tracePath.includes(nodeId)) return;

    // Valid move
    playNodeClick();
    playPathSegment();
    const edgeKey = `${Math.min(lastNode, nodeId)}-${Math.max(lastNode, nodeId)}`;
    setTracePath(prev => [...prev, nodeId]);
    setActiveEdges(prev => new Set(prev).add(edgeKey));
    setHintNodeId(null);

    // Check if this is the target
    if (node.type === 'target') {
      // Puzzle complete!
      handlePuzzleComplete();
    }
  }, [phase, grid, tracePath, buildAdj]);

  // ── Puzzle completion ──
  const handlePuzzleComplete = useCallback(() => {
    setPhase('completing');
    setFlashNodes(true);
    playPuzzleComplete();
    setStatusText('Node Secured');
    setStatusKey(prev => prev + 1);

    // Check if API has responded — trigger exit sequence
    const shouldExit = apiResolvedRef.current;

    setTimeout(() => {
      setFlashNodes(false);

      if (shouldExit) {
        // ACCESS GRANTED sequence
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
        // Generate new puzzle
        setGridAnimClass('hacking-grid-dissolve');
        setTimeout(() => {
          const newCount = puzzleCount + 1;
          setPuzzleCount(newCount);
          const maxSize = isMobile ? 5 : 7;
          const baseSize = 4;
          const growth = Math.floor(newCount / 2);
          const size = Math.min(baseSize + growth, maxSize);
          const newGrid = generateGrid(size, size);
          setGrid(newGrid);
          setTracePath([]);
          setActiveEdges(new Set());
          setGridAnimClass('hacking-grid-enter');
          setPhase('playing');
          hintGivenRef.current = false;
        }, 400);
      }
    }, 600);
  }, [puzzleCount, isMobile, onComplete]);

  // ── Compute node positions ──
  const getNodePos = useCallback((node: Node, gridData: GridData) => {
    const padding = 0.12;
    const x = padding + (node.col / Math.max(gridData.cols - 1, 1)) * (1 - 2 * padding);
    const y = padding + (node.row / Math.max(gridData.rows - 1, 1)) * (1 - 2 * padding);
    return { x: x * 100, y: y * 100 };
  }, []);

  const nodeRadius = isMobile ? 3.5 : 2.8;

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="hacking-container">
      {/* Scanlines */}
      <div className="hacking-scanlines" />

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
        IP: {fakeIp}<br />
        CONNECTION: {phase === 'access-granted' ? 'TERMINATED' : 'ESTABLISHED'}
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
              const nodeA = grid.nodes.find(n => n.id === edge.a)!;
              const nodeB = grid.nodes.find(n => n.id === edge.b)!;
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

            {/* Nodes */}
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
                <circle
                  key={`node-${node.id}`}
                  cx={pos.x}
                  cy={pos.y}
                  r={nodeRadius}
                  className={className}
                  onClick={() => handleNodeClick(node.id)}
                />
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}
