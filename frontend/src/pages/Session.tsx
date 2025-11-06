import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Activity, BarChart3, TrendingUp, Calendar } from 'lucide-react';

export default function Session() {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <div className="space-y-8">
      <div className="slide-in-from-bottom">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center space-x-2 text-slate-600 hover:text-slate-900 transition-colors mb-4"
        >
          <ArrowLeft size={18} />
          <span>Back</span>
        </button>
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-teal-600 to-blue-600 bg-clip-text text-transparent">
            Session Analysis
          </h1>
          <p className="text-slate-600">View detailed metrics and activity for your session</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 slide-in-from-bottom" style={{ animationDelay: '0.1s' }}>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Session ID</p>
              <p className="text-lg font-semibold text-slate-900 font-mono">{id?.substring(0, 12)}...</p>
            </div>
            <Activity className="text-blue-500" size={24} />
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Artworks</p>
              <p className="text-2xl font-bold text-slate-900">--</p>
            </div>
            <BarChart3 className="text-teal-500" size={24} />
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Status</p>
              <p className="text-lg font-semibold text-green-600">Active</p>
            </div>
            <TrendingUp className="text-green-500" size={24} />
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Created</p>
              <p className="text-sm font-semibold text-slate-900">Today</p>
            </div>
            <Calendar className="text-slate-500" size={24} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 slide-in-from-bottom" style={{ animationDelay: '0.2s' }}>
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Activity Graph</h2>
          <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-lg h-80 flex items-center justify-center border border-slate-200">
            <div className="text-center">
              <Activity size={48} className="mx-auto mb-3 text-slate-300" />
              <p className="text-slate-500 font-medium">Session graph visualization coming soon</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Session Info</h2>
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs font-semibold text-blue-600 mb-1">Session ID</p>
              <p className="text-sm font-mono text-blue-900 break-all">{id}</p>
            </div>

            <div className="p-4 bg-teal-50 border border-teal-200 rounded-lg">
              <p className="text-xs font-semibold text-teal-600 mb-1">Status</p>
              <div className="flex items-center space-x-2">
                <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-teal-900 font-medium">Active</span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <p className="text-xs font-semibold text-slate-600 mb-1">Last Updated</p>
              <p className="text-sm text-slate-900">{new Date().toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
