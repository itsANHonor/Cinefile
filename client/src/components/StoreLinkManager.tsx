import React, { useState } from 'react';

interface StoreLink {
  label: string;
  url: string;
}

interface StoreLinkManagerProps {
  links: StoreLink[];
  onChange: (links: StoreLink[]) => void;
  disabled?: boolean;
}

const COMMON_LABELS = [
  'Amazon',
  'Blu-ray.com',
  'Best Buy',
  'Zavvi',
  'DigiPack',
  'Steelbook Central',
  'DVDCompare',
  'Custom'
];

const StoreLinkManager: React.FC<StoreLinkManagerProps> = ({ links, onChange, disabled = false }) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newLink, setNewLink] = useState<StoreLink>({ label: '', url: '' });
  const [errors, setErrors] = useState<{ label?: string; url?: string }>({});
  const [showCustomLabel, setShowCustomLabel] = useState(false);
  const [customLabel, setCustomLabel] = useState('');

  const isValidUrl = (url: string): boolean => {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleLabelChange = (label: string) => {
    if (label === 'Custom') {
      setShowCustomLabel(true);
      setNewLink({ ...newLink, label: '' });
    } else {
      setShowCustomLabel(false);
      setCustomLabel('');
      setNewLink({ ...newLink, label });
    }
  };

  const handleCustomLabelChange = (customLabel: string) => {
    setCustomLabel(customLabel);
    setNewLink({ ...newLink, label: customLabel });
  };

  const validateLink = (link: StoreLink): { label?: string; url?: string } => {
    const errors: { label?: string; url?: string } = {};
    
    if (!link.label.trim()) {
      errors.label = 'Label is required';
    }
    
    if (!link.url.trim()) {
      errors.url = 'URL is required';
    } else if (!isValidUrl(link.url)) {
      errors.url = 'Please enter a valid URL (http:// or https://)';
    }
    
    return errors;
  };

  const handleAddLink = () => {
    const validationErrors = validateLink(newLink);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    onChange([...links, newLink]);
    setNewLink({ label: '', url: '' });
    setCustomLabel('');
    setShowCustomLabel(false);
    setErrors({});
  };

  const handleEditLink = (index: number) => {
    setEditingIndex(index);
    const linkToEdit = links[index];
    setNewLink(linkToEdit);
    
    // Check if this is a custom label (not in COMMON_LABELS)
    if (!COMMON_LABELS.includes(linkToEdit.label)) {
      setShowCustomLabel(true);
      setCustomLabel(linkToEdit.label);
    } else {
      setShowCustomLabel(false);
      setCustomLabel('');
    }
    
    setErrors({});
  };

  const handleUpdateLink = () => {
    if (editingIndex === null) return;

    const validationErrors = validateLink(newLink);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const updatedLinks = [...links];
    updatedLinks[editingIndex] = newLink;
    onChange(updatedLinks);
    
    setEditingIndex(null);
    setNewLink({ label: '', url: '' });
    setErrors({});
  };

  const handleDeleteLink = (index: number) => {
    const updatedLinks = links.filter((_, i) => i !== index);
    onChange(updatedLinks);
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setNewLink({ label: '', url: '' });
    setCustomLabel('');
    setShowCustomLabel(false);
    setErrors({});
  };

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Store / Release Links
      </label>
      
      {/* Existing Links */}
      {links.length > 0 && (
        <div className="space-y-2">
          {links.map((link, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{link.label}</span>
                  <a
                    href={/^https?:\/\//i.test(link.url || '') ? link.url : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm truncate"
                  >
                    {link.url}
                  </a>
                </div>
              </div>
              {!disabled && (
                <div className="flex gap-2 ml-4">
                  <button
                    type="button"
                    onClick={() => handleEditLink(index)}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                    title="Edit"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteLink(index)}
                    className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Form */}
      {editingIndex === null ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Label
              </label>
              <select
                value={newLink.label}
                onChange={(e) => handleLabelChange(e.target.value)}
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <option value="">Select a label...</option>
                {COMMON_LABELS.map(label => (
                  <option key={label} value={label}>{label}</option>
                ))}
              </select>
              {showCustomLabel && (
                <input
                  type="text"
                  value={customLabel}
                  onChange={(e) => handleCustomLabelChange(e.target.value)}
                  disabled={disabled}
                  placeholder="Enter custom label..."
                  className="mt-2 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                URL
              </label>
              <input
                type="url"
                value={newLink.url}
                onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
                disabled={disabled}
                placeholder="https://example.com"
                className={`w-full px-3 py-2 border rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                  errors.url 
                    ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/20' 
                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
                } text-gray-900 dark:text-gray-100`}
              />
              {errors.url && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.url}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleAddLink}
            disabled={disabled || !newLink.label || !newLink.url}
            className="btn-primary text-sm py-2 px-4"
          >
            Add Link
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Label
              </label>
              <select
                value={newLink.label}
                onChange={(e) => handleLabelChange(e.target.value)}
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <option value="">Select a label...</option>
                {COMMON_LABELS.map(label => (
                  <option key={label} value={label}>{label}</option>
                ))}
              </select>
              {showCustomLabel && (
                <input
                  type="text"
                  value={customLabel}
                  onChange={(e) => handleCustomLabelChange(e.target.value)}
                  disabled={disabled}
                  placeholder="Enter custom label..."
                  className="mt-2 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                />
              )}
              {errors.label && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.label}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                URL
              </label>
              <input
                type="url"
                value={newLink.url}
                onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
                disabled={disabled}
                placeholder="https://example.com"
                className={`w-full px-3 py-2 border rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                  errors.url 
                    ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/20' 
                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
                } text-gray-900 dark:text-gray-100`}
              />
              {errors.url && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.url}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleUpdateLink}
              disabled={disabled}
              className="btn-primary text-sm py-2 px-4"
            >
              Update Link
            </button>
            <button
              type="button"
              onClick={handleCancelEdit}
              disabled={disabled}
              className="btn-secondary text-sm py-2 px-4"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StoreLinkManager;
