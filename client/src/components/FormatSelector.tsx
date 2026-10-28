import React, { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import { useFacets } from '../hooks/useFacets';
import { PHYSICAL_FORMATS } from '../lib/formats';
import { PRESET_VERSION_TAGS } from '../lib/editionTags';
import EditionTagInput from './EditionTagInput';
import { CollectionFacetEdition } from '../types';

interface FormatSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (formats: string[], versionNotes?: string) => void;
  movieTitle: string;
  initialFormats?: string[];
  initialVersionNotes?: string;
  availableVersionTags?: CollectionFacetEdition[];
  confirmLabel?: string;
}

const FormatSelector: React.FC<FormatSelectorProps> = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  movieTitle,
  initialFormats = [],
  initialVersionNotes = '',
  availableVersionTags,
  confirmLabel,
}) => {
  const [selectedFormats, setSelectedFormats] = useState<string[]>(initialFormats);
  const [versionNotes, setVersionNotes] = useState<string>(initialVersionNotes);
  const { toast } = useToast();
  const { facets } = useFacets();

  // Serialize deps so a new-but-equal array reference (e.g. the `[]` default)
  // doesn't retrigger the sync and wipe the user's in-progress selection
  const initialFormatsKey = initialFormats.join('|');
  const initialVersionKey = initialVersionNotes || '';
  useEffect(() => {
    if (isOpen) {
      setSelectedFormats(initialFormats);
      setVersionNotes(initialVersionNotes || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialFormatsKey, initialVersionKey]);

  const availableFormats = PHYSICAL_FORMATS;
  const resolvedVersionTags = availableVersionTags ?? facets?.versions ?? [];

  const handleFormatToggle = (format: string) => {
    setSelectedFormats(prev => 
      prev.includes(format) 
        ? prev.filter(f => f !== format)
        : [...prev, format]
    );
  };

  const handleConfirm = () => {
    if (selectedFormats.length === 0) {
      toast({ message: 'Please select at least one format.', type: 'warning' });
      return;
    }
    onConfirm(selectedFormats, versionNotes.trim() || undefined);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />

      {/* Modal */}
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full">
          {/* Header */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Select Formats &amp; Version
              </h2>
              <button
                onClick={onClose}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Choose the formats and optional version/cut for <strong>{movieTitle}</strong>
            </p>
          </div>

          {/* Format Selection */}
          <div className="p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Formats *
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {availableFormats.map((format) => (
                  <label
                    key={format}
                    className="flex items-center space-x-2.5 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedFormats.includes(format)}
                      onChange={() => handleFormatToggle(format)}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {format}
                    </span>
                  </label>
                ))}
              </div>

              {selectedFormats.length > 0 && (
                <div className="mt-3 p-2.5 bg-gray-50 dark:bg-gray-700 rounded">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1.5">Selected formats:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedFormats.map((format) => (
                      <span
                        key={format}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200"
                      >
                        {format}
                        <button
                          type="button"
                          onClick={() => handleFormatToggle(format)}
                          className="ml-1 inline-flex items-center justify-center w-3 h-3 rounded-full hover:bg-primary-200 dark:hover:bg-primary-800 transition-colors"
                        >
                          <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Optional Version / Cut Input */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <label
                htmlFor="format-selector-version-notes"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Version / Cut
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-1.5">
                  (Optional)
                </span>
              </label>
              <EditionTagInput
                id="format-selector-version-notes"
                value={versionNotes}
                onChange={setVersionNotes}
                availableTags={resolvedVersionTags}
                presetTags={PRESET_VERSION_TAGS}
                placeholder="e.g., Theatrical, Extended, Director's Cut..."
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Click a preset or type a custom version. You can add multiple versions or add the movie again for separate discs.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selectedFormats.length === 0}
              className="btn-primary"
            >
              {confirmLabel || (initialFormats.length > 0 ? 'Save Changes' : 'Add Movie')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FormatSelector;

