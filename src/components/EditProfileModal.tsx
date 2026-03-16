'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Camera, Image as ImageIcon, Palette, Check, CaretDown } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserAvatar } from './UserAvatar';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProfile: {
    username: string;
    displayName?: string;
    image?: string | null;
    bannerImage?: string | null;
    bio?: string | null;
    preferredLanguage?: string | null;
    level: number;
    rating: number;
  };
  onSave: () => void;
}

const PRESET_BANNERS = [
  { id: 'preset:cyber', label: 'Cyber Grid', gradient: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' },
  { id: 'preset:aurora', label: 'Aurora', gradient: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)' },
  { id: 'preset:ember', label: 'Ember', gradient: 'linear-gradient(135deg, #1a0a00, #3d1f00, #0d0d0d)' },
  { id: 'preset:ocean', label: 'Deep Ocean', gradient: 'linear-gradient(135deg, #000428, #004e92, #000428)' },
  { id: 'preset:void', label: 'Void', gradient: 'linear-gradient(135deg, #0a0a0a, #1a1a2e, #16213e)' },
  { id: 'preset:neon', label: 'Neon Night', gradient: 'linear-gradient(135deg, #0d0221, #150050, #3f0071)' },
];

const BANNER_COLORS = [
  'color:#1e1b4b', 'color:#1e3a5f', 'color:#1a2e1a', 'color:#3b1a2e',
  'color:#2d1b0e', 'color:#0f172a', 'color:#1c1917', 'color:#0c0a09',
];

const LANGUAGES = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go',
  'Rust', 'Ruby', 'Swift', 'Kotlin', 'PHP', 'Dart', 'Scala', 'Elixir',
  'Haskell', 'Lua', 'R', 'Shell',
];

const LANGUAGE_COLORS: Record<string, string> = {
  'JavaScript': '#f7df1e', 'TypeScript': '#3178c6', 'Python': '#3776ab',
  'Java': '#f89820', 'C++': '#00599c', 'C#': '#68217a', 'Go': '#00add8',
  'Rust': '#ce412b', 'Ruby': '#cc342d', 'Swift': '#fa7343', 'Kotlin': '#7f52ff',
  'PHP': '#777bb4', 'Dart': '#0175c2', 'Scala': '#dc322f', 'Elixir': '#6e4a7e',
  'Haskell': '#5e5086', 'Lua': '#000080', 'R': '#276dc3', 'Shell': '#89e051',
};

function getBannerStyle(bannerImage?: string | null): React.CSSProperties {
  if (!bannerImage) {
    return { background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' };
  }
  if (bannerImage.startsWith('preset:')) {
    const preset = PRESET_BANNERS.find(p => p.id === bannerImage);
    return { background: preset?.gradient || 'linear-gradient(135deg, #0f172a, #1e1b4b)' };
  }
  if (bannerImage.startsWith('color:')) {
    const color = bannerImage.replace('color:', '');
    return { backgroundColor: color };
  }
  return { backgroundImage: `url(${bannerImage})`, backgroundSize: 'cover', backgroundPosition: 'center' };
}

export function EditProfileModal({ isOpen, onClose, currentProfile, onSave }: EditProfileModalProps) {
  const [image, setImage] = useState<string | null>(currentProfile.image || null);
  const [bannerImage, setBannerImage] = useState<string | null>(currentProfile.bannerImage || null);
  const [bio, setBio] = useState(currentProfile.bio || '');
  const [displayName, setDisplayName] = useState(currentProfile.displayName || currentProfile.username);
  const [preferredLanguage, setPreferredLanguage] = useState<string | null>(currentProfile.preferredLanguage || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [bannerMode, setBannerMode] = useState<'presets' | 'colors' | 'upload'>('presets');
  const [showLangDropdown, setShowLangDropdown] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setImage(currentProfile.image || null);
      setBannerImage(currentProfile.bannerImage || null);
      setBio(currentProfile.bio || '');
      setDisplayName(currentProfile.displayName || currentProfile.username);
      setPreferredLanguage(currentProfile.preferredLanguage || null);
      setError('');
    }
  }, [isOpen, currentProfile]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'banner') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;

      // Create a canvas for cropping
      const img = document.createElement('img');
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;

        if (type === 'avatar') {
          // Square crop for avatar
          const size = Math.min(img.width, img.height);
          canvas.width = 256;
          canvas.height = 256;
          const sx = (img.width - size) / 2;
          const sy = (img.height - size) / 2;
          ctx.drawImage(img, sx, sy, size, size, 0, 0, 256, 256);
          setImage(canvas.toDataURL('image/webp', 0.8));
        } else {
          // Banner crop (3:1 aspect)
          const targetRatio = 3;
          let sw = img.width;
          let sh = img.width / targetRatio;
          if (sh > img.height) {
            sh = img.height;
            sw = img.height * targetRatio;
          }
          canvas.width = 900;
          canvas.height = 300;
          const sx = (img.width - sw) / 2;
          const sy = (img.height - sh) / 2;
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 900, 300);
          setBannerImage(canvas.toDataURL('image/webp', 0.8));
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    // Reset the input
    e.target.value = '';
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image,
          bannerImage,
          bio: bio.trim(),
          displayName: displayName.trim(),
          preferredLanguage,
        }),
      });

      const resText = await res.text();
      let data;
      try {
        data = JSON.parse(resText);
      } catch (e) {
        console.error('Non-JSON response:', resText);
        throw new Error(`Server error: ${res.status} ${res.statusText}`);
      }

      if (!res.ok) throw new Error(data.error || 'Failed to save');

      onSave();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="max-w-2xl w-full max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 z-20 flex items-center justify-between p-6 pb-0 bg-slate-900/95 backdrop-blur-sm">
            <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
              Edit Profile
            </h2>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-800 transition-colors text-slate-400 hover:text-white">
              <X size={24} />
            </button>
          </div>

          <div className="p-6 space-y-8">
            {/* Live Preview */}
            <div className="rounded-2xl overflow-hidden border border-slate-700/50">
              <div className="relative h-28" style={getBannerStyle(bannerImage)}>
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 to-transparent" />
              </div>
              <div className="bg-slate-800/50 px-6 pb-5 -mt-12 relative z-10">
                <div className="flex items-end gap-4">
                  <div className="ring-4 ring-slate-900 rounded-full">
                    <UserAvatar username={currentProfile.username} image={image} size="lg" />
                  </div>
                  <div className="pb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-lg text-white">{displayName || currentProfile.username}</span>
                      {preferredLanguage && (
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold border"
                          style={{
                            backgroundColor: `${LANGUAGE_COLORS[preferredLanguage] || '#666'}20`,
                            borderColor: `${LANGUAGE_COLORS[preferredLanguage] || '#666'}50`,
                            color: LANGUAGE_COLORS[preferredLanguage] || '#999',
                          }}
                        >
                          {preferredLanguage}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 line-clamp-1">{bio || 'No bio yet'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Avatar Upload */}
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-3">Profile Photo</label>
              <div className="flex items-center gap-4">
                <div className="relative group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
                  <UserAvatar username={currentProfile.username} image={image} size="lg" />
                  <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera size={24} className="text-white" />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors"
                  >
                    Upload Photo
                  </button>
                  {image && (
                    <button
                      onClick={() => setImage(null)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm text-slate-300 font-medium transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'avatar')} />
              </div>
            </div>

            {/* Banner Selection */}
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-3">Profile Banner</label>
              <div className="flex gap-2 mb-4">
                {([['presets', 'Presets', <ImageIcon key="i" size={16} />], ['colors', 'Colors', <Palette key="p" size={16} />], ['upload', 'Upload', <Camera key="c" size={16} />]] as const).map(([mode, label, icon]) => (
                  <button
                    key={mode}
                    onClick={() => setBannerMode(mode)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                      bannerMode === mode ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {icon} {label}
                  </button>
                ))}
              </div>

              {bannerMode === 'presets' && (
                <div className="grid grid-cols-3 gap-2">
                  {PRESET_BANNERS.map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => setBannerImage(preset.id)}
                      className={`h-16 rounded-xl border-2 transition-all overflow-hidden relative ${
                        bannerImage === preset.id ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-slate-700 hover:border-slate-500'
                      }`}
                      style={{ background: preset.gradient }}
                    >
                      <span className="absolute bottom-1 left-2 text-[10px] font-bold text-white/60">{preset.label}</span>
                      {bannerImage === preset.id && (
                        <div className="absolute top-1 right-1">
                          <Check size={14} className="text-indigo-400" weight="bold" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {bannerMode === 'colors' && (
                <div className="flex flex-wrap gap-2">
                  {BANNER_COLORS.map(color => {
                    const hex = color.replace('color:', '');
                    return (
                      <button
                        key={color}
                        onClick={() => setBannerImage(color)}
                        className={`w-12 h-12 rounded-xl border-2 transition-all ${
                          bannerImage === color ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-slate-700 hover:border-slate-500'
                        }`}
                        style={{ backgroundColor: hex }}
                      />
                    );
                  })}
                  <button
                    onClick={() => setBannerImage(null)}
                    className={`w-12 h-12 rounded-xl border-2 transition-all flex items-center justify-center text-xs font-bold ${
                      !bannerImage ? 'border-indigo-500 ring-2 ring-indigo-500/30 text-indigo-400' : 'border-slate-700 text-slate-500 hover:border-slate-500'
                    }`}
                    style={{ background: 'linear-gradient(135deg, #0f172a, #1e1b4b)' }}
                  >
                    Default
                  </button>
                </div>
              )}

              {bannerMode === 'upload' && (
                <div>
                  <button
                    onClick={() => bannerInputRef.current?.click()}
                    className="w-full h-20 rounded-xl border-2 border-dashed border-slate-700 hover:border-indigo-500/50 flex items-center justify-center gap-2 text-slate-400 hover:text-indigo-400 transition-colors"
                  >
                    <Camera size={20} /> Click to upload banner image
                  </button>
                  <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'banner')} />
                </div>
              )}
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-2" htmlFor="edit-displayname">Display Name</label>
              <input
                id="edit-displayname"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                maxLength={30}
              />
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-2" htmlFor="edit-bio">Bio</label>
              <textarea
                id="edit-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 160))}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none h-24"
                placeholder="Tell the world about your coding journey..."
                maxLength={160}
              />
              <div className="flex justify-end mt-1">
                <span className={`text-xs font-medium ${bio.length > 140 ? 'text-amber-400' : 'text-slate-500'}`}>
                  {bio.length}/160
                </span>
              </div>
            </div>

            {/* Preferred Language */}
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-2">Favorite Language</label>
              <p className="text-xs text-slate-500 mb-3">Shows as a badge next to your name</p>
              <div className="relative">
                <button
                  onClick={() => setShowLangDropdown(!showLangDropdown)}
                  className="w-full flex items-center justify-between bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-left transition-all hover:border-slate-500"
                >
                  {preferredLanguage ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: LANGUAGE_COLORS[preferredLanguage] || '#666' }} />
                      <span className="text-white font-medium">{preferredLanguage}</span>
                    </span>
                  ) : (
                    <span className="text-slate-500">None selected</span>
                  )}
                  <CaretDown size={16} className="text-slate-400" />
                </button>

                {showLangDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-h-48 overflow-y-auto z-30">
                    <button
                      onClick={() => { setPreferredLanguage(null); setShowLangDropdown(false); }}
                      className="w-full px-4 py-2.5 text-left text-sm text-slate-400 hover:bg-slate-800 transition-colors"
                    >
                      None
                    </button>
                    {LANGUAGES.map(lang => (
                      <button
                        key={lang}
                        onClick={() => { setPreferredLanguage(lang); setShowLangDropdown(false); }}
                        className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 hover:bg-slate-800 transition-colors ${
                          preferredLanguage === lang ? 'text-indigo-400' : 'text-white'
                        }`}
                      >
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: LANGUAGE_COLORS[lang] || '#666' }} />
                        {lang}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-950/50 border border-red-500/30 text-red-400 p-3 rounded-xl text-sm font-medium">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 px-6 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-colors border border-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-6 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
