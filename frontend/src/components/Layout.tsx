import { Outlet, useLocation, Link } from 'react-router-dom';
import { Palette, CheckCircle, Eye } from 'lucide-react';

export default function Layout() {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-teal-50">
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-slate-200">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center space-x-3 group">
              <div className="p-2 bg-gradient-to-br from-teal-500 to-blue-500 rounded-lg group-hover:shadow-lg transition-shadow">
                <Palette size={24} className="text-white" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-xl font-bold bg-gradient-to-r from-teal-600 to-blue-600 bg-clip-text text-transparent">
                  ProofOfArt
                </h1>
                <p className="text-xs text-slate-500">AI Art Certification</p>
              </div>
            </Link>

            <div className="flex items-center space-x-1 sm:space-x-2">
              <Link
                to="/"
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${
                  isActive('/')
                    ? 'bg-gradient-to-r from-teal-500 to-blue-500 text-white shadow-lg'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Palette size={18} />
                <span className="hidden sm:inline font-medium">Create</span>
              </Link>

              <Link
                to="/verify"
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${
                  isActive('/verify')
                    ? 'bg-gradient-to-r from-teal-500 to-blue-500 text-white shadow-lg'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Eye size={18} />
                <span className="hidden sm:inline font-medium">Verify</span>
              </Link>

              <Link
                to="/"
                className="flex items-center space-x-2 px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-all"
              >
                <CheckCircle size={18} />
                <span className="hidden sm:inline font-medium">Status</span>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>

      <footer className="mt-16 border-t border-slate-200 bg-white/40 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-8 text-center text-sm text-slate-600">
          <p>Proof of Art - Verify, Certify, and Protect Your Creative Works</p>
        </div>
      </footer>
    </div>
  );
}
