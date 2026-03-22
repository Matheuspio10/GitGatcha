'use client';
import { useState, useEffect } from 'react';
import { Volume2, VolumeX, Settings, X } from 'lucide-react';
import { GlobalAudio } from '@/lib/audioManager';

export function AudioSettingsPanel({ onClose }: { onClose?: () => void }) {
  const [settings, setSettings] = useState(GlobalAudio.Settings);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleUpdate = () => setSettings(GlobalAudio.Settings);
    // Simple poll instead of events for fast sync
    const interval = setInterval(handleUpdate, 500);
    return () => clearInterval(interval);
  }, []);

  const handleMuteToggle = () => {
    GlobalAudio.toggleMute();
    setSettings(GlobalAudio.Settings);
    GlobalAudio.play('general/button_click_secondary');
  };

  const handleChange = (key: 'masterVolume'|'musicVolume'|'sfxVolume', val: number) => {
    if (key === 'masterVolume') GlobalAudio.setMasterVolume(val);
    if (key === 'musicVolume') GlobalAudio.setMusicVolume(val);
    if (key === 'sfxVolume') GlobalAudio.setSfxVolume(val);
    setSettings(GlobalAudio.Settings);
  };

  const handleRelease = () => {
    GlobalAudio.play('general/button_click_primary');
  };

  if (onClose) {
     return (
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-6 min-w-64 text-sm font-mono text-slate-300 relative shadow-xl z-50">
          <button onClick={onClose} className="absolute top-2 right-2 text-slate-500 hover:text-white transition-colors">
            <X size={16} />
          </button>
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2 text-cyan-500">
               <Settings size={16} />
               <span className="font-bold tracking-widest uppercase text-xs">A/V SYSTEM</span>
            </div>
            <button onClick={handleMuteToggle} className={`p-1.5 rounded-md transition-colors ${settings.isMuted ? 'bg-red-500/20 text-red-500' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
               {settings.isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          </div>
          
          <div className="space-y-4">
             <VolumeSlider label="MASTER OUTPUT" value={settings.masterVolume} onChange={(v) => handleChange('masterVolume', v)} onRelease={handleRelease} />
             <VolumeSlider label="SFX CHANNEL" value={settings.sfxVolume} onChange={(v) => handleChange('sfxVolume', v)} onRelease={handleRelease} />
             <VolumeSlider label="MUSIC/BG CHANNEL" value={settings.musicVolume} onChange={(v) => handleChange('musicVolume', v)} onRelease={handleRelease} />
          </div>
        </div>
     );
  }

  // If used as a toggle popover
  return (
    <div className="relative">
      <button 
        onClick={() => { setIsOpen(!isOpen); GlobalAudio.play('general/button_click_secondary'); }}
        className={`p-2 rounded-lg border transition-colors ${settings.isMuted ? 'text-red-500 border-red-500/30 bg-red-500/10' : 'text-slate-400 border-slate-800 hover:border-cyan-500/50 hover:text-cyan-400'}`}
        title="Audio Settings"
      >
        {settings.isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
      
      {isOpen && (
        <div className="absolute right-0 top-full mt-2">
           <AudioSettingsPanel onClose={() => setIsOpen(false)} />
        </div>
      )}
    </div>
  );
}

function VolumeSlider({ label, value, onChange, onRelease }: { label: string, value: number, onChange: (v: number) => void, onRelease: () => void }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-xs">
         <span className="text-slate-400 uppercase tracking-wider">{label}</span>
         <span className="text-cyan-500 font-bold">{Math.round(value)}%</span>
      </div>
      <input 
         type="range" min="0" max="100" value={value} 
         onChange={(e) => onChange(Number(e.target.value))}
         onMouseUp={onRelease}
         onTouchEnd={onRelease}
         className="w-full h-1.5 bg-slate-800 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-cyan-500 [&::-webkit-slider-thumb]:rounded-full cursor-pointer" 
      />
    </div>
  );
}
