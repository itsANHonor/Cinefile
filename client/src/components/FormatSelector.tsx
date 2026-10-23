import React, { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { PHYSICAL_FORMATS } from '../lib/formats';

interface FormatSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (formats: string[]) => void;
  movieTitle: string;
  initialFormats?: string[];
}

const FormatSelector: React.FC<FormatSelectorProps> = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  movieTitle,
  initialFormats = [] 
}) => {
  const [selectedFormats, setSelectedFormats] = useState<string[]>(initialFormats);
  const { toast } = useToast();

  const availableFormats = PHYSICAL_FORMATS;

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
    onConfirm(selectedFormats);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />

      {/* Modal */}
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
          {/* Header */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Select Formats
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
              Choose the formats for <strong>{movieTitle}</strong>
            </p>
          </div>

          {/* Format Selection */}
          <div className="p-6">
            <div className="space-y-3">
              {availableFormats.map((format) => (
                <label
                  key={format}
                  className="flex items-center space-x-3 cursor-pointer"
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
              <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Selected formats:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedFormats.map((format) => (
                    <span
                      key={format}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200"
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
              Add Movie
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FormatSelector;
