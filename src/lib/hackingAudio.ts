/**
 * Hacking Mini-Game Audio routed through the central AudioManager
 */
import { GlobalAudio } from './audioManager';

export function playNodeClick() {
  GlobalAudio.play('hacking/node_click');
}

export function playPathSegment() {
  GlobalAudio.play('hacking/path_segment');
}

export function playPuzzleComplete() {
  GlobalAudio.play('hacking/puzzle_complete');
}

export function playAccessGranted() {
  GlobalAudio.play('hacking/access_granted');
}

export function playFirewallAlarm() {
  GlobalAudio.play('hacking/firewall_alarm');
}

export function startAmbientDrone() {
  // Drone removed to align with standard webm-based architecture limits
}

export function stopAmbientDrone() {
  // No-op
}

