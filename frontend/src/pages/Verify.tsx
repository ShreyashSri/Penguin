import { useState } from 'react';
import { Shield, CheckCircle, AlertCircle, Loader2, Copy } from 'lucide-react';
import { verifyByKey } from '../lib/api';
import { useToast } from '../components/Toast';

interface VerificationResult {
  valid: boolean;
  artwork?: {
    id: string;
    ipfs_hash: string;
    blockchain_tx_hash: string;
    created_at: string;
    content_type: string;
  };
  error?: string;
}

export default function Verify() {
  const [key, setKey] = useState('');
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const { success, error, info } = useToast();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) {
      error('Please enter a verification key or IPFS hash');
      return;
    }

    setLoading(true);
    try {
      const res = await verifyByKey(key);
      setResult(res);
      if (res.valid) {
        success('Artwork verified successfully!');
      } else {
        error(res.error || 'Verification failed');
      }
    } catch (err) {
      console.error('Error verifying:', err);
      error('Failed to verify artwork');
      setResult({ valid: false, error: 'Verification request failed' });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    info('Copied to clipboard');
  };

  return (
    <div className="space-y-8">
      <div className="slide-in-from-bottom">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-teal-600 to-blue-600 bg-clip-text text-transparent">
            Verify Artwork
          </h1>
          <p className="text-slate-600">Check the authenticity and blockchain certification of any artwork</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 slide-in-from-bottom" style={{ animationDelay: '0.1s' }}>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center space-x-2 mb-6">
              <Shield className="text-blue-600" size={24} />
              <h2 className="text-2xl font-bold text-slate-900">Verify Certificate</h2>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Verification Key or IPFS Hash
                </label>
                <input
                  type="text"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="Enter /ipfs/Qm... or verification key"
                  className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono text-sm"
                  disabled={loading}
                />
                <p className="mt-2 text-xs text-slate-500">
                  Paste the IPFS hash or certificate key from your artwork
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || !key.trim()}
                className="w-full bg-gradient-to-r from-blue-500 to-teal-500 hover:from-blue-600 hover:to-teal-600 disabled:from-slate-400 disabled:to-slate-400 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 shadow-md hover:shadow-lg"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <Shield size={18} />
                    <span>Verify Certificate</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">What is verified?</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>✓ Artwork authenticity</li>
                <li>✓ Blockchain transaction</li>
                <li>✓ IPFS storage proof</li>
                <li>✓ Creation timestamp</li>
                <li>✓ Content type</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 slide-in-from-bottom" style={{ animationDelay: '0.2s' }}>
          {result ? (
            <div className={`bg-white rounded-2xl p-6 shadow-sm border-2 ${
              result.valid ? 'border-green-200' : 'border-red-200'
            }`}>
              <div className="flex items-center space-x-3 mb-6">
                {result.valid ? (
                  <>
                    <div className="p-3 bg-green-100 rounded-full">
                      <CheckCircle size={28} className="text-green-600" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-green-900">Verified</h2>
                      <p className="text-sm text-green-700">Artwork is authentic and certified</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="p-3 bg-red-100 rounded-full">
                      <AlertCircle size={28} className="text-red-600" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-red-900">Verification Failed</h2>
                      <p className="text-sm text-red-700">{result.error || 'Artwork could not be verified'}</p>
                    </div>
                  </>
                )}
              </div>

              {result.valid && result.artwork && (
                <div className="space-y-4">
                  <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Artwork ID</label>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm text-slate-900 break-all">{result.artwork.id}</span>
                        <button
                          onClick={() => copyToClipboard(result.artwork?.id || '')}
                          className="ml-2 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
                        >
                          <Copy size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-3">
                      <label className="block text-xs font-semibold text-slate-600 mb-1">IPFS Hash</label>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm text-slate-900 break-all">{result.artwork.ipfs_hash}</span>
                        <button
                          onClick={() => copyToClipboard(result.artwork?.ipfs_hash || '')}
                          className="ml-2 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
                        >
                          <Copy size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-3">
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Blockchain TX Hash</label>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm text-slate-900 break-all">{result.artwork.blockchain_tx_hash}</span>
                        <button
                          onClick={() => copyToClipboard(result.artwork?.blockchain_tx_hash || '')}
                          className="ml-2 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
                        >
                          <Copy size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-3 grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Content Type</label>
                        <p className="text-sm text-slate-900 capitalize">{result.artwork.content_type}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Certified</label>
                        <p className="text-sm text-slate-900">
                          {new Date(result.artwork.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm text-green-800">
                      <span className="font-semibold">This artwork is certified and stored on IPFS with blockchain proof of ownership.</span> You can share this certificate link with anyone to prove authenticity.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-12 shadow-sm border border-slate-200 text-center">
              <div className="text-slate-300 mb-4">
                <Shield size={64} className="mx-auto" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Ready to Verify</h2>
              <p className="text-slate-500">Enter an IPFS hash or verification key to check artwork authenticity</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
