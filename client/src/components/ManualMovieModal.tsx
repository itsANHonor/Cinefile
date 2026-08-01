import React, { useEffect, useState } from 'react';
import type { ManualMovieData } from '../types';
import { apiService } from '../services/api.service';

interface ManualMovieModalProps {
  isOpen: boolean;
  initialTitle?: string;
  onClose: () => void;
  onConfirm: (movie: ManualMovieData) => void;
}

const ManualMovieModal: React.FC<ManualMovieModalProps> = ({
  isOpen,
  initialTitle = '',
  onClose,
  onConfirm,
}) => {
  const [formData, setFormData] = useState<ManualMovieData>({
    title: '',
    synopsis: '',
    director: '',
    release_date: '',
    cast: [],
    cover_art_url: '',
  });
  const [castMember, setCastMember] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        title: initialTitle,
        synopsis: '',
        director: '',
        release_date: '',
        cast: [],
        cover_art_url: '',
      });
      setCastMember('');
    }
  }, [initialTitle, isOpen]);

  const updateField = (field: keyof Omit<ManualMovieData, 'cast'>, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addCastMember = () => {
    const name = castMember.trim();
    if (!name) return;
    setFormData(prev => ({ ...prev, cast: [...prev.cast, name] }));
    setCastMember('');
  };

  const removeCastMember = (index: number) => {
    setFormData(prev => ({
      ...prev,
      cast: prev.cast.filter((_, castIndex) => castIndex !== index),
    }));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const result = await apiService.uploadImage(file);
      updateField('cover_art_url', result.url);
    } catch (error) {
      console.error('Manual movie image upload failed:', error);
      alert('Failed to upload image. Please try again.');
    } finally {
      setUploadingImage(false);
      event.target.value = '';
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.title.trim() || uploadingImage) return;

    onConfirm({
      ...formData,
      title: formData.title.trim(),
      synopsis: formData.synopsis.trim(),
      director: formData.director.trim(),
      cast: formData.cast.filter(member => member.trim()),
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="flex min-h-screen items-start justify-center p-4 pt-12">
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between p-6 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Create Movie Manually</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Add a movie that is not available on TMDB.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Close manual movie form"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label htmlFor="manual-movie-title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                id="manual-movie-title"
                value={formData.title}
                onChange={event => updateField('title', event.target.value)}
                required
                autoFocus
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-100"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="manual-movie-release-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Release date
                </label>
                <input
                  id="manual-movie-release-date"
                  type="date"
                  value={formData.release_date}
                  onChange={event => updateField('release_date', event.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <div>
                <label htmlFor="manual-movie-director" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Director
                </label>
                <input
                  id="manual-movie-director"
                  value={formData.director}
                  onChange={event => updateField('director', event.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
            </div>

            <div>
              <label htmlFor="manual-movie-synopsis" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Synopsis
              </label>
              <textarea
                id="manual-movie-synopsis"
                value={formData.synopsis}
                onChange={event => updateField('synopsis', event.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cast</label>
              <div className="flex gap-2">
                <input
                  value={castMember}
                  onChange={event => setCastMember(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addCastMember();
                    }
                  }}
                  placeholder="Add cast member"
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-100"
                />
                <button type="button" onClick={addCastMember} className="btn-secondary">Add</button>
              </div>
              {formData.cast.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.cast.map((member, index) => (
                    <span key={`${member}-${index}`} className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded">
                      {member}
                      <button type="button" onClick={() => removeCastMember(index)} aria-label={`Remove ${member}`}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="manual-movie-cover-art" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Cover art URL
              </label>
              <input
                id="manual-movie-cover-art"
                type="url"
                value={formData.cover_art_url}
                onChange={event => updateField('cover_art_url', event.target.value)}
                placeholder="https://example.com/poster.jpg"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-100"
              />
              <label className="block text-xs text-gray-500 dark:text-gray-400 mt-2 mb-1">Or upload an image</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                disabled={uploadingImage}
                className="w-full text-sm text-gray-500 dark:text-gray-400"
              />
              {uploadingImage && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Uploading...</p>}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={!formData.title.trim() || uploadingImage} className="btn-primary disabled:opacity-50">
                Continue to Formats
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ManualMovieModal;
