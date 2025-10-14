import React, { useState, useEffect } from 'react';
import './App.css';
import ScriptForm from './components/ScriptForm';
import ResultsDisplay from './components/ResultsDisplay';
import ResultsDisplayContinuation from './components/ResultsDisplayContinuation';
import DownloadButton from './components/DownloadButton';
import VideoGenerator from './components/VideoGenerator';
import ErrorBoundary from './components/ErrorBoundary';
import ContinuationMode from './components/ContinuationMode';
import SegmentManager from './components/SegmentManager';
import BulkOperations from './components/BulkOperations';
import { generateSegments } from './api/client';
import ScriptFormPlus from './components/ScriptFormPlus';
import ResultsDisplayPlus from './components/ResultsDisplayPlus';
import DownloadButtonPlus from './components/DownloadButtonPlus';
import VideoGeneratorPlus from './components/VideoGeneratorPlus';
import { generateSegmentsPlus } from './api/clientPlus';

function App() {
  useEffect(() => {
    // App component mounted
  }, []);

  // Simple environment indicator
  const [envInfo, setEnvInfo] = useState({ environment: 'development' });
  
  useEffect(() => {
    // Simple fetch with error handling
    try {
      fetch('/api/health')
        .then(res => {
          if (res.ok) {
            return res.json();
          }
          throw new Error('Health check failed');
        })
        .then(data => {
          // Environment info received
          setEnvInfo(data);
        })
        .catch(err => {
          // Could not fetch environment info
          // Keep the default development environment
        });
    } catch (error) {
      // Error in environment fetch
    }
  }, []);

  const [activeTab, setActiveTab] = useState('standard'); // standard | continuation | standard-plus
  const [forceRefresh, setForceRefresh] = useState(Date.now());
  
  // Separate loading states for each mode
  const [standardLoading, setStandardLoading] = useState(false);
  const [plusLoading, setPlusLoading] = useState(false);
  
  // Separate results for each mode
  const [standardResults, setStandardResults] = useState(null);
  const [plusResults, setPlusResults] = useState(null);
  
  // Separate errors for each mode
  const [standardError, setStandardError] = useState(null);
  const [plusError, setPlusError] = useState(null);
  
  const [showSegmentManager, setShowSegmentManager] = useState(false);
  const [showBulkOperations, setShowBulkOperations] = useState(false);

  const handleSubmit = async (formData) => {
    console.log('Form submitted with:', formData);
    
    if (activeTab === 'standard') {
      setStandardLoading(true);
      setStandardError(null);
      setStandardResults(null);
    } else if (activeTab === 'standard-plus') {
      setPlusLoading(true);
      setPlusError(null);
      setPlusResults(null);
    }

    try {
      const response = activeTab === 'standard-plus' ?
        await generateSegmentsPlus(formData) :
        await generateSegments(formData);
      console.log('Generation successful:', response);
      
      if (activeTab === 'standard') {
        setStandardResults({
          ...response,
          settings: formData
        });
      } else if (activeTab === 'standard-plus') {
        setPlusResults({
          ...response,
          settings: formData
        });
      }
    } catch (err) {
      console.error('Generation failed:', err);
      if (activeTab === 'standard') {
        setStandardError(err.message || 'Something went wrong');
      } else if (activeTab === 'standard-plus') {
        setPlusError(err.message || 'Something went wrong');
      }
    } finally {
      if (activeTab === 'standard') {
        setStandardLoading(false);
      } else if (activeTab === 'standard-plus') {
        setPlusLoading(false);
      }
    }
  };

  const handleSegmentUpdate = (updatedSegments, mode) => {
    if (mode === 'standard' && standardResults) {
      setStandardResults({
        ...standardResults,
        segments: updatedSegments,
        metadata: {
          ...standardResults.metadata,
          totalSegments: updatedSegments.length,
          estimatedDuration: updatedSegments.length * 8
        }
      });
    } else if (mode === 'standard-plus' && plusResults) {
      setPlusResults({
        ...plusResults,
        segments: updatedSegments,
        metadata: {
          ...plusResults.metadata,
          totalSegments: updatedSegments.length,
          estimatedDuration: updatedSegments.length * 8
        }
      });
    }
  };

  return (
    <ErrorBoundary>
      <div className="App">
        <header className="App-header">
          <h1>AdScript Studio</h1>
          <p>The fastest way to segment, structure, and scale UGC ads.</p>
          {envInfo.environment !== 'production' && (
            <div style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              background: envInfo.environment === 'test' ? '#ffc107' : '#17a2b8',
              color: 'white',
              padding: '5px 10px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 'bold',
              textTransform: 'uppercase'
            }}>
              {envInfo.environment || 'development'} Environment
            </div>
          )}
        </header>

        <main className="App-main">
          <div className="tab-navigation">
            <button
              className={`tab-button ${activeTab === 'standard' ? 'active' : ''}`}
              onClick={() => setActiveTab('standard')}
            >
              Standard Generation
            </button>
            <button
              className={`tab-button ${activeTab === 'continuation' ? 'active' : ''}`}
              onClick={() => setActiveTab('continuation')}
            >
              Continuation Mode
            </button>
            <button
              className={`tab-button ${activeTab === 'standard-plus' ? 'active' : ''}`}
              onClick={() => setActiveTab('standard-plus')}
            >
              Standard Plus
            </button>
          </div>

          {activeTab === 'standard' && (
            <>
              <ScriptForm onSubmit={handleSubmit} loading={standardLoading} />
              {standardError && <div className="error-message">Error: {standardError}</div>}
              {standardResults && (
                <>
                  <ResultsDisplay results={standardResults} />
                  <div className="action-buttons">
                    <button
                      className="toggle-manager-btn"
                      onClick={() => setShowSegmentManager(!showSegmentManager)}
                    >
                      {showSegmentManager ? '📋 Hide' : '🔧 Manage'} Segments
                    </button>
                    <button
                      className="toggle-bulk-btn"
                      onClick={() => setShowBulkOperations(!showBulkOperations)}
                    >
                      {showBulkOperations ? '🔍 Hide' : '🔍 Find'} & Replace
                    </button>
                  </div>
                  {showSegmentManager && (
                    <SegmentManager
                      segments={standardResults.segments}
                      onUpdate={(updated) => handleSegmentUpdate(updated, 'standard')}
                    />
                  )}
                  {showBulkOperations && (
                    <BulkOperations
                      segments={standardResults.segments}
                      onUpdate={(updated) => handleSegmentUpdate(updated, 'standard')}
                    />
                  )}
                  <DownloadButton segments={standardResults.segments} metadata={standardResults.metadata} />
                  <VideoGenerator segments={standardResults.segments} />
                </>
              )}
            </>
          )}

          {activeTab === 'continuation' && (
            <>
              <ContinuationMode />
            </>
          )}

          {activeTab === 'standard-plus' && (
            <>
              <ScriptFormPlus onSubmit={handleSubmit} loading={plusLoading} />
              {plusError && <div className="error-message">Error: {plusError}</div>}
              {plusResults && (
                <>
                  <ResultsDisplayPlus results={plusResults} />
                  <div className="action-buttons">
                    <button
                      className="toggle-manager-btn"
                      onClick={() => setShowSegmentManager(!showSegmentManager)}
                    >
                      {showSegmentManager ? '📋 Hide' : '🔧 Manage'} Segments
                    </button>
                    <button
                      className="toggle-bulk-btn"
                      onClick={() => setShowBulkOperations(!showBulkOperations)}
                    >
                      {showBulkOperations ? '🔍 Hide' : '🔍 Find'} & Replace
                    </button>
                  </div>
                  {showSegmentManager && (
                    <SegmentManager
                      segments={plusResults.segments}
                      onUpdate={(updated) => handleSegmentUpdate(updated, 'standard-plus')}
                    />
                  )}
                  {showBulkOperations && (
                    <BulkOperations
                      segments={plusResults.segments}
                      onUpdate={(updated) => handleSegmentUpdate(updated, 'standard-plus')}
                    />
                  )}
                  <DownloadButtonPlus segments={plusResults.segments} metadata={plusResults.metadata} />
                  <VideoGeneratorPlus segments={plusResults.segments} />
                </>
              )}
            </>
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}

export default App;
