'use client';

interface UserAvatarProps {
  username: string;
  image?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showUploadHint?: boolean;
  onClick?: () => void;
}

const sizeClasses = {
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-lg',
  lg: 'w-16 h-16 text-2xl',
  xl: 'w-36 h-36 text-6xl',
};

export function UserAvatar({ username, image, size = 'md', className = '', showUploadHint = false, onClick }: UserAvatarProps) {
  const sizeClass = sizeClasses[size] || sizeClasses.md;
  const initial = (username || '?').charAt(0).toUpperCase();

  if (image) {
    return (
      <div className={`relative group ${onClick ? 'cursor-pointer' : ''} ${className}`} onClick={onClick}>
        <img
          src={image}
          alt={username}
          className={`${sizeClass} rounded-full object-cover ring-2 ring-slate-800 border border-indigo-500/30`}
        />
        {showUploadHint && (
          <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 md:group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <span className="text-white text-xs font-bold">📷</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`relative group ${onClick ? 'cursor-pointer' : ''} ${className}`} onClick={onClick}>
      <div className={`${sizeClass} rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black`}>
        {initial}
      </div>
      {showUploadHint && (
        <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 md:group-hover:opacity-100 flex items-center justify-center transition-opacity">
          <span className="text-white text-xs font-bold">📷</span>
        </div>
      )}
    </div>
  );
}
