import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function Home() {
  const user = await getCurrentUser();
  if (user) {
    redirect('/store');
  }

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[85vh] text-center overflow-hidden w-full">
      {/* Background decorations */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[120px] -z-10" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[120px] -z-10" />

      <h1 className="text-7xl md:text-9xl font-black mb-6 bg-clip-text text-transparent bg-gradient-to-br from-blue-400 via-indigo-400 to-purple-500 tracking-tighter drop-shadow-xl z-10">
        GitGacha
      </h1>
      
      <p className="text-xl md:text-2xl text-slate-300 max-w-2xl mb-12 font-light leading-relaxed z-10">
        Collect real open-source developers, forge the ultimate engineering team, and dominate the repository battles.
      </p>
      
      <div className="w-full max-w-md p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-2xl z-10 transform hover:scale-[1.02] transition-transform duration-500">
        <h2 className="text-2xl font-bold mb-8 text-white">Start Your Journey</h2>
        <div className="flex flex-col gap-4">
          <Link href="/login" className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 text-center">
            Login
          </Link>
          <Link href="/login?register=true" className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3.5 px-4 rounded-xl border border-slate-700 transition-all hover:-translate-y-0.5 text-center">
            Register Account
          </Link>
        </div>
      </div>
    </div>
  );
}
