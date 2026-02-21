import React, { useState } from 'react';
import PropTypes from 'prop-types';

const SegmentLookup = ({ manager }) => {
  const [taskSid, setTaskSid] = useState('');
  const [loading, setLoading] = useState(false);
  const [segmentIds, setSegmentIds] = useState(null);
  const [error, setError] = useState(null);

  const handleLookup = async () => {
    if (!taskSid.trim()) return;

    setLoading(true);
    setError(null);
    setSegmentIds(null);

    try {
      const params = new URLSearchParams({
        TaskSid: taskSid.trim(),
        Token: manager.store.getState().flex.session.ssoTokenPayload.token
      });

      const response = await fetch(`${process.env.FLEX_APP_SERVERLESS_URL}?${params}`);
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Request failed');

      setSegmentIds(data.segment_ids || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Segment ID Lookup</h2>
      
      <div style={{ marginTop: '16px' }}>
        <input
          type="text"
          value={taskSid}
          onChange={(e) => setTaskSid(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleLookup()}
          placeholder="Enter Task SID"
          disabled={loading}
          style={{ 
            padding: '8px 12px',
            fontSize: '14px',
            width: '300px',
            marginRight: '10px',
            border: '1px solid #ccc',
            borderRadius: '4px'
          }}
        />
        <button 
          onClick={handleLookup} 
          disabled={loading || !taskSid.trim()}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            backgroundColor: loading || !taskSid.trim() ? '#ccc' : '#0263e0',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading || !taskSid.trim() ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Loading...' : 'Lookup'}
        </button>
      </div>

      {error && (
        <div style={{ color: '#d32f2f', marginTop: '16px' }}>
          Error: {error}
        </div>
      )}

      {segmentIds && (
        <div style={{ marginTop: '16px' }}>
          <strong>Found {segmentIds.length} segment ID(s):</strong>
          {segmentIds.length > 0 ? (
            <ul>
              {segmentIds.map((id, index) => (
                <li key={index}>{id}</li>
              ))}
            </ul>
          ) : (
            <p>No segments found</p>
          )}
        </div>
      )}
    </div>
  );
};

SegmentLookup.propTypes = {
  manager: PropTypes.object.isRequired
};

export default SegmentLookup;
