import React, { useState, useEffect } from 'react';
import { Upload, Image, FileText, Music, Sparkles, Copy, ExternalLink, Loader2, Trash2 } from 'lucide-react';
import { generateArt, importArt, getCertificate } from '../lib/api';
import { useToast } from '../components/Toast';

interface Artwork {
  id: string;
  title: string;
  prompt: string;
  contentType: string;
  ipfsHash: string;
  blockchainTxHash: string;
  createdAt: string;
  certificateUrl: string;
}

export default function Dashboard() {
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [prompt, setPrompt] = useState('');
  const [contentType, setContentType] = useState('image');
  const [provider, setProvider] = useState('openai');
  const [loading, setLoading] = useState(false);
  const [userWallet, setUserWallet] = useState('');
  const { success, error, info } = useToast();

  useEffect(() => {
    const wallet = localStorage.getItem('walletAddress') || '';
    setUserWallet(wallet);
    loadArtworks();
  }, []);

  const loadArtworks = async () => {
    const storedArtworks = localStorage.getItem('artworks');
    if (storedArtworks) {
      setArtworks(JSON.parse(storedArtworks));
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      error('Please enter a prompt');
      return;
    }

    setLoading(true);
    try {
      const response = await generateArt({
        user_id: userWallet,
        prompt: prompt,
        content_type: contentType,
        llm_provider: provider,
        parameters: {}
      });

      const newArtwork: Artwork = {
        id: response.artwork.id,
        title: prompt.substring(0, 50),
        prompt: prompt,
        contentType: contentType,
        ipfsHash: response.artwork.ipfs_hash,
        blockchainTxHash: response.artwork.blockchain_tx_hash,
        createdAt: new Date().toISOString(),
        certificateUrl: response.certificate.verification_url
      };

      const updatedArtworks = [...artworks, newArtwork];
      setArtworks(updatedArtworks);
      localStorage.setItem('artworks', JSON.stringify(updatedArtworks));

      setPrompt('');
      success('Artwork generated and certified successfully!');
    } catch (err) {
      console.error('Error generating art:', err);
      error('Failed to generate artwork. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (file: File) => {
    setLoading(true);
    try {
      const fileData = await file.arrayBuffer();
      const response = await importArt({
        user_id: userWallet,
        source_url: '',
        content_type: contentType,
        file_data: Array.from(new Uint8Array(fileData)),
        prompt: prompt,
        source_platform: 'external',
        metadata: {}
      });

      const newArtwork: Artwork = {
        id: response.artwork.id,
        title: file.name,
        prompt: prompt,
        contentType: contentType,
        ipfsHash: response.artwork.ipfs_hash,
        blockchainTxHash: response.artwork.blockchain_tx_hash,
        createdAt: new Date().toISOString(),
        certificateUrl: response.certificate.verification_url
      };

      const updatedArtworks = [...artworks, newArtwork];
      setArtworks(updatedArtworks);
      localStorage.setItem('artworks', JSON.stringify(updatedArtworks));

      success('Artwork imported and certified successfully!');
    } catch (err) {
      console.error('Error importing art:', err);
      error('Failed to import artwork. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const downloadCertificate = async (artworkId: string) => {
    try {
      const certificate = await getCertificate(artworkId);
      const blob = new Blob([JSON.stringify(certificate, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `certificate-${artworkId}.json`;
      a.click();
      success('Certificate downloaded');
    } catch (err) {
      console.error('Error downloading certificate:', err);
      error('Failed to download certificate');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    info('Copied to clipboard');
  };

  const removeArtwork = (id: string) => {
    const updatedArtworks = artworks.filter(a => a.id !== id);
    setArtworks(updatedArtworks);
    localStorage.setItem('artworks', JSON.stringify(updatedArtworks));
    success('Artwork removed');
  };

  return (
    <div className="space-y-8">
      <div className="slide-in-from-bottom">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-teal-600 to-blue-600 bg-clip-text text-transparent">
            Create & Certify Art
          </h1>
          <p className="text-slate-600">Generate AI art or import your work, then get blockchain certification</p>
        </div>
        {userWallet && (
          <div className="mt-4 inline-block px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-slate-600">
              Wallet: <span className="font-mono text-blue-600">{userWallet.substring(0, 10)}...{userWallet.substring(userWallet.length - 8)}</span>
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 slide-in-from-bottom" style={{ animationDelay: '0.1s' }}>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
            <div className="flex items-center space-x-2 mb-6">
              <Sparkles className="text-teal-600" size={24} />
              <h2 className="text-2xl font-bold text-slate-900">New Artwork</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Content Type</label>
                <select
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                >
                  <option value="image">Image</option>
                  <option value="text">Text</option>
                  <option value="audio">Audio</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">LLM Provider</label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                >
                  <option value="openai">OpenAI</option>
                  <option value="stability">Stability AI</option>
                  <option value="midjourney">Midjourney</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Prompt</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe your creative vision..."
                  className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all min-h-[120px] resize-none"
                />
              </div>

              <button
                onClick={handleGenerate}
                disabled={loading}
                className="w-full bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-600 hover:to-blue-600 disabled:from-slate-400 disabled:to-slate-400 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 shadow-md hover:shadow-lg"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    <span>Generate & Certify</span>
                  </>
                )}
              </button>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-300"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-white text-slate-500">or import</span>
                </div>
              </div>

              <label className="w-full bg-gradient-to-br from-blue-50 to-teal-50 hover:from-blue-100 hover:to-teal-100 border-2 border-dashed border-slate-300 rounded-lg py-8 flex flex-col items-center justify-center cursor-pointer transition-all group">
                <Upload size={32} className="mb-2 text-slate-400 group-hover:text-teal-600 transition-colors" />
                <span className="text-sm font-medium text-slate-600">Import artwork</span>
                <span className="text-xs text-slate-500">PNG, JPG, MP3, etc.</span>
                <input
                  type="file"
                  accept="image/*,audio/*"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      handleImport(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                  disabled={loading}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 slide-in-from-bottom" style={{ animationDelay: '0.2s' }}>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Your Certified Works</h2>

            {artworks.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-slate-300 mb-4">
                  <Image size={48} className="mx-auto" />
                </div>
                <p className="text-slate-500 font-medium">No artworks yet</p>
                <p className="text-slate-400 text-sm">Create or import your first piece to get started</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {artworks.map((artwork, index) => (
                  <div
                    key={artwork.id}
                    className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-5 border border-slate-200 hover:border-teal-400 transition-all group animate-in fade-in"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <div className="aspect-square bg-gradient-to-br from-teal-100 to-blue-100 rounded-lg mb-4 flex items-center justify-center relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-teal-400/10 to-blue-400/10 group-hover:from-teal-400/20 group-hover:to-blue-400/20 transition-all" />
                      {artwork.contentType === 'image' ? (
                        <Image size={48} className="text-slate-400 relative z-10" />
                      ) : artwork.contentType === 'text' ? (
                        <FileText size={48} className="text-slate-400 relative z-10" />
                      ) : (
                        <Music size={48} className="text-slate-400 relative z-10" />
                      )}
                    </div>

                    <h3 className="font-semibold text-slate-900 mb-1 truncate">{artwork.title}</h3>
                    <p className="text-sm text-slate-500 mb-4 line-clamp-2">{artwork.prompt}</p>

                    <div className="space-y-2 mb-4 bg-white rounded-lg p-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-medium">IPFS</span>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-teal-600 text-xs">{artwork.ipfsHash.substring(0, 12)}...</span>
                          <button
                            onClick={() => copyToClipboard(artwork.ipfsHash)}
                            className="text-slate-400 hover:text-teal-600 transition-colors"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-medium">Blockchain</span>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-blue-600 text-xs">{artwork.blockchainTxHash.substring(0, 12)}...</span>
                          <button
                            onClick={() => copyToClipboard(artwork.blockchainTxHash)}
                            className="text-slate-400 hover:text-blue-600 transition-colors"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex space-x-2">
                      <button
                        onClick={() => downloadCertificate(artwork.id)}
                        className="flex-1 bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-600 hover:to-blue-600 text-white text-sm font-medium py-2 px-3 rounded-lg transition-all flex items-center justify-center space-x-1"
                      >
                        <ExternalLink size={14} />
                        <span>Certificate</span>
                      </button>
                      <button
                        onClick={() => removeArtwork(artwork.id)}
                        className="bg-slate-100 hover:bg-red-100 text-slate-600 hover:text-red-600 text-sm font-medium py-2 px-3 rounded-lg transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
