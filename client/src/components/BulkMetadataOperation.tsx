import React, { useState, useEffect, useRef } from 'react';
import { apiService } from '../services/api.service';
import { useToast } from '../context/ToastContext';

interface JobState {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  total: number;
  completed: number;
  successful: number;
  failed: number;
  current?: string;
  pass: number;
  errors: Array<{ movieId: number; title: string; error: string }>;
  startTime: number;
  endTime?: number;
}

interface BulkMetadataOperationProps {
  onComplete?: () => void;
}

const BulkMetadataOperation: React.FC<BulkMetadataOperationProps> = ({ onComplete }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [jobState, setJobState] = useState<JobState | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    return () => {
      // Cleanup: abort fetch request on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const startOperation = async () => {
    try {
      setIsRunning(true);
      setJobState(null); // Reset any previous state
      console.log('[BulkMetadata] Starting operation...');
      
      const result = await apiService.startBulkMetadata();
      console.log('[BulkMetadata] Response:', result);
      
      // If no jobId, it means there are no movies to update
      if (!result.jobId) {
        toast({ message: result.message || 'No movies found with missing metadata. All movies appear to have complete metadata.', type: 'info' });
        setIsRunning(false);
        return;
      }
      
      const { jobId, total } = result;
      console.log('[BulkMetadata] Job started:', jobId, 'Total:', total);
      
      // Use fetch with streaming instead of EventSource to support auth headers
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('Not authenticated. Please log in again.');
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      console.log('[BulkMetadata] Connecting to stream:', `/api/media/bulk-metadata/${jobId}/stream`);
      const response = await fetch(`/api/media/bulk-metadata/${jobId}/stream`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        signal: abortController.signal,
      });

      console.log('[BulkMetadata] Response status:', response.status, 'Content-Type:', response.headers.get('content-type'));

      if (!response.ok) {
        // Try to read error as JSON first
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          console.error('[BulkMetadata] API error:', errorData);
          throw new Error(errorData.error || `HTTP ${response.status}`);
        } else {
          const errorText = await response.text();
          console.error('[BulkMetadata] API error text:', errorText);
          throw new Error(errorText || `HTTP ${response.status}`);
        }
      }

      // Check if response is actually SSE
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('text/event-stream')) {
        const errorText = await response.text();
        console.error('[BulkMetadata] Unexpected content type:', contentType, errorText);
        throw new Error(`Expected SSE stream, got: ${contentType}. ${errorText}`);
      }

      console.log('[BulkMetadata] Stream connected, starting to read...');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Failed to get response stream');
      }

      let buffer = '';

      const readStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              console.log('[BulkMetadata] Stream ended');
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  console.log('[BulkMetadata] Update:', data);
                  setJobState(data);

                  if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
                    setIsRunning(false);
                    if (onComplete) {
                      onComplete();
                    }
                    return;
                  }
                } catch (error) {
                  console.error('[BulkMetadata] Error parsing SSE data:', error, line);
                }
              } else if (line.startsWith(': heartbeat')) {
                // Ignore heartbeat
                continue;
              }
            }
          }
        } catch (error) {
          console.error('[BulkMetadata] Stream error:', error);
          setIsRunning(false);
        }
      };

      readStream();
    } catch (error: any) {
      console.error('[BulkMetadata] Failed to start bulk metadata operation:', error);
      toast({
        message: error.message || error.response?.data?.error || 'Failed to start bulk metadata operation',
        type: 'error',
      });
      setIsRunning(false);
    }
  };

  const cancelOperation = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRunning(false);
    setJobState(null);
  };

  const progress = jobState ? (jobState.completed / jobState.total) * 100 : 0;
  const isComplete = jobState?.status === 'completed' || jobState?.status === 'failed' || jobState?.status === 'cancelled';

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Bulk Metadata Update
        </h3>
        {isRunning && !isComplete && (
          <button
            onClick={cancelOperation}
            className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
          >
            Cancel
          </button>
        )}
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Update metadata for all movies with missing information. This will fetch data from TMDB for movies that have a TMDB ID but are missing synopsis, director, cast, cover art, release date, or genres.
      </p>

      {!jobState && (
        <button
          onClick={(e) => {
            e.preventDefault();
            console.log('[BulkMetadata] Button clicked');
            startOperation();
          }}
          disabled={isRunning}
          className="btn-primary w-full"
        >
          {isRunning ? 'Starting...' : 'Start Bulk Metadata Update'}
        </button>
      )}

      {jobState && (
        <div className="space-y-4">
          {/* Progress Bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Progress
              </span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {jobState.completed} / {jobState.total} ({Math.round(progress)}%)
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
              <div
                className="bg-primary-600 h-4 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Successful</div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {jobState.successful}
              </div>
            </div>
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Failed</div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {jobState.failed}
              </div>
            </div>
          </div>

          {/* Current Status */}
          {jobState.current && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                {jobState.pass === 2 ? 'Retry Pass' : 'Current'} (Pass {jobState.pass}/2)
              </div>
              <div className="font-medium text-gray-900 dark:text-gray-100">
                {jobState.current}
              </div>
            </div>
          )}

          {/* Status Message */}
          <div className={`p-3 rounded-lg ${
            jobState.status === 'completed' 
              ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
              : jobState.status === 'failed'
              ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
              : 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300'
          }`}>
            <div className="font-medium">
              {jobState.status === 'completed' && '✓ Operation completed successfully'}
              {jobState.status === 'failed' && '✗ Operation failed'}
              {jobState.status === 'cancelled' && 'Operation cancelled'}
              {jobState.status === 'running' && 'Operation in progress...'}
              {jobState.status === 'pending' && 'Operation pending...'}
            </div>
          </div>

          {/* Errors */}
          {jobState.errors.length > 0 && (
            <div className="mt-4">
              <details className="border border-gray-300 dark:border-gray-600 rounded-lg">
                <summary className="p-3 cursor-pointer font-medium text-gray-900 dark:text-gray-100">
                  Errors ({jobState.errors.length})
                </summary>
                <div className="p-3 border-t border-gray-300 dark:border-gray-600 max-h-48 overflow-y-auto">
                  {jobState.errors.map((error, index) => (
                    <div key={index} className="text-sm text-red-600 dark:text-red-400 mb-2">
                      <strong>{error.title}</strong>: {error.error}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {/* Restart Button */}
          {isComplete && (
            <button
              onClick={() => {
                setJobState(null);
                startOperation();
              }}
              className="btn-primary w-full"
            >
              Start New Operation
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default BulkMetadataOperation;



