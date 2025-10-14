import React, { useState } from 'react';
import { VOICE_TYPES } from '../voiceTypes';
import ResultsDisplayContinuation from './ResultsDisplayContinuation';
import DownloadButton from './DownloadButton';

function ContinuationMode() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  
  // Form data - includes all options from standard mode
  const [formData, setFormData] = useState({
    script: '',
    ageRange: '25-34',
    gender: 'female',
    product: '',
    voiceType: 'warm-friendly',
    energyLevel: '80',
    jsonFormat: 'standard',
    settingMode: 'single',
    room: 'living room',
    style: 'casual and friendly',
    locations: [],
    cameraStyle: 'static-handheld',
    timeOfDay: 'morning',
    backgroundLife: false,
    productStyle: '',
    energyArc: 'consistent',
    narrativeStyle: 'direct-review',
    // Advanced character details
    ethnicity: '',
    characterFeatures: '',
    clothingDetails: '',
    accentRegion: 'neutral-american',
    // Ad Strategy fields
    awareness: '',
    promise: '',
    patternBreaker: '',
    headlinePattern: '',
    headline: ''
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newData = {
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    };
    
    // Clear productStyle when product is empty
    if (name === 'product' && (!value || value.trim() === '')) {
      newData.productStyle = '';
    }
    
    setFormData(newData);
  };

  const handleSettingModeChange = (mode) => {
    setFormData({
      ...formData,
      settingMode: mode,
      locations: mode === 'single' ? [] : getDefaultLocations(mode)
    });
  };

  const getDefaultLocations = (mode) => {
    if (mode === 'home-tour') {
      return ['living room', 'kitchen', 'bedroom', 'home office'];
    } else if (mode === 'indoor-outdoor') {
      return ['living room', 'porch', 'kitchen', 'backyard'];
    }
    return [];
  };

  const handleLocationChange = (index, value) => {
    const newLocations = [...formData.locations];
    newLocations[index] = value;
    setFormData({
      ...formData,
      locations: newLocations
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      // Transform formData to match continuation API expectations
      const requestData = {
        script: formData.script,
        product: formData.product,
        voiceProfile: {
          voiceType: formData.voiceType,
          energyLevel: formData.energyLevel,
          accentRegion: formData.accentRegion
        },
        ageRange: formData.ageRange,
        gender: formData.gender,
        style: formData.style,
        jsonFormat: formData.jsonFormat,
        settingMode: formData.settingMode,
        room: formData.room,
        locations: formData.locations,
        cameraStyle: formData.cameraStyle,
        timeOfDay: formData.timeOfDay,
        backgroundLife: formData.backgroundLife,
        productStyle: formData.productStyle,
        energyArc: formData.energyArc,
        narrativeStyle: formData.narrativeStyle,
        // Advanced character details
        ethnicity: formData.ethnicity,
        characterFeatures: formData.characterFeatures,
        clothingDetails: formData.clothingDetails,
        // Ad Strategy fields
        awareness: formData.awareness,
        promise: formData.promise,
        patternBreaker: formData.patternBreaker,
        headlinePattern: formData.headlinePattern,
        headline: formData.headline
      };

      const response = await fetch('/api/generate-continuation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Continuation API response:', data);
      
      // Handle multiple segments response (like standard mode)
      if (data.success && data.segments) {
        setResults({
          segments: data.segments,
          metadata: data.metadata || {},
          settings: formData
        });
      } else {
        throw new Error('Invalid response format from continuation API');
      }
    } catch (err) {
      console.error('Generation failed:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="continuation-mode">
      <div className="mode-header">
        <h2>Continuation Mode</h2>
        <p>Generate video segments that continue from a previous video, maintaining character consistency and narrative flow.</p>
      </div>

      <form className="form-container" onSubmit={handleSubmit}>
        {/* 1. Script Section */}
        <div className="form-section">
          <h3>Script</h3>
          <div className="form-group">
            <label htmlFor="script">Full Script *</label>
            <textarea
              id="script"
              name="script"
              value={formData.script}
              onChange={handleChange}
              placeholder="Enter your complete UGC script here. It will be automatically split into 8-second segments..."
              rows={8}
              required
            />
            <p className="form-help-text">
              Each segment needs 15-22 words (6-8 seconds of speaking). Short sentences will be automatically combined.
            </p>
          </div>
        </div>

        {/* 2. Character Details Section */}
        <div className="form-section">
          <h3>Character Details</h3>
          
          {/* Basic Character Details */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="ageRange">Age Range</label>
              <select
                id="ageRange"
                name="ageRange"
                value={formData.ageRange}
                onChange={handleChange}
              >
                <option value="18-24">18-24</option>
                <option value="25-34">25-34</option>
                <option value="35-44">35-44</option>
                <option value="45-54">45-54</option>
                <option value="55+">55+</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="gender">Gender</label>
              <select
                id="gender"
                name="gender"
                value={formData.gender}
                onChange={handleChange}
              >
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="non-binary">Non-binary</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="voiceType">Voice Type</label>
              <select
                id="voiceType"
                name="voiceType"
                value={formData.voiceType}
                onChange={handleChange}
              >
                {VOICE_TYPES.map(v => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="energyLevel">Energy Level ({formData.energyLevel}%)</label>
              <input
                type="range"
                id="energyLevel"
                name="energyLevel"
                value={formData.energyLevel}
                onChange={handleChange}
                min="50"
                max="100"
                step="5"
              />
            </div>
          </div>

          {/* Advanced Character Details */}
          <div className="form-subsection">
            <h4>Advanced Details (Optional)</h4>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="ethnicity">Ethnicity/Appearance</label>
                <select
                  id="ethnicity"
                  name="ethnicity"
                  value={formData.ethnicity || ''}
                  onChange={handleChange}
                >
                  <option value="">Not specified</option>
                  <option value="caucasian">Caucasian</option>
                  <option value="african-american">African American</option>
                  <option value="hispanic-latino">Hispanic/Latino</option>
                  <option value="asian-east">East Asian</option>
                  <option value="asian-south">South Asian</option>
                  <option value="middle-eastern">Middle Eastern</option>
                  <option value="mixed-race">Mixed Race</option>
                  <option value="pacific-islander">Pacific Islander</option>
                  <option value="native-american">Native American</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="accentRegion">Accent/Regional Voice</label>
                <select
                  id="accentRegion"
                  name="accentRegion"
                  value={formData.accentRegion || 'neutral-american'}
                  onChange={handleChange}
                >
                  <option value="neutral-american">Neutral American</option>
                  <option value="southern-us">Southern US</option>
                  <option value="new-york">New York</option>
                  <option value="midwest">Midwest</option>
                  <option value="california">California</option>
                  <option value="british-rp">British (RP)</option>
                  <option value="british-regional">British Regional</option>
                  <option value="australian">Australian</option>
                  <option value="canadian">Canadian</option>
                  <option value="irish">Irish</option>
                  <option value="scottish">Scottish</option>
                  <option value="international">International/Mixed</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="characterFeatures">Specific Features (Optional)</label>
              <input
                type="text"
                id="characterFeatures"
                name="characterFeatures"
                value={formData.characterFeatures || ''}
                onChange={handleChange}
                placeholder="e.g., curly hair, glasses, freckles, beard..."
              />
            </div>

            <div className="form-group">
              <label htmlFor="clothingDetails">Clothing Details (Optional)</label>
              <input
                type="text"
                id="clothingDetails"
                name="clothingDetails"
                value={formData.clothingDetails || ''}
                onChange={handleChange}
                placeholder="e.g., cream knit sweater, dark blue jeans, silver necklace..."
              />
            </div>
          </div>
        </div>

        {/* 3. Product Section */}
        <div className="form-section">
          <h3>Product</h3>
          <div className="form-group">
            <label htmlFor="product">Product Name (optional)</label>
            <input
              type="text"
              id="product"
              name="product"
              value={formData.product}
              onChange={handleChange}
              placeholder="e.g., Skincare Serum, Coffee Maker..."
            />
          </div>
        </div>

        {/* 4. Location Section */}
        <div className="form-section">
          <h3>Location</h3>
          <div className="form-group">
            <label htmlFor="settingMode">Setting Mode</label>
            <select
              id="settingMode"
              name="settingMode"
              value={formData.settingMode}
              onChange={handleChange}
            >
              <option value="single">Single Location</option>
              <option value="home-tour">Mixed Locations - Home Tour</option>
              <option value="indoor-outdoor">Mixed Locations - Indoor/Outdoor</option>
            </select>
            <p className="form-help-text">
              {formData.settingMode === 'single' 
                ? 'Film in one consistent location'
                : formData.settingMode === 'home-tour'
                ? 'Move through different rooms in the home'
                : 'Mix indoor and outdoor locations'}
            </p>
          </div>

          {formData.settingMode === 'single' ? (
            <div className="form-group">
              <label htmlFor="room">Room/Setting</label>
              <select
                id="room"
                name="room"
                value={formData.room}
                onChange={handleChange}
              >
                <option value="living room">Living Room</option>
                <option value="kitchen">Kitchen</option>
                <option value="bathroom">Bathroom</option>
                <option value="bedroom">Bedroom</option>
                <option value="home office">Home Office</option>
                <option value="porch">Porch</option>
                <option value="backyard">Backyard/Patio</option>
              </select>
            </div>
          ) : (
            <div className="form-group">
              <label>Location Sequence</label>
              {formData.locations.map((location, index) => (
                <div key={index} className="location-item">
                  <span>Segment {index + 1}:</span>
                  <select
                    value={location}
                    onChange={(e) => handleLocationChange(index, e.target.value)}
                  >
                    <option value="living room">Living Room</option>
                    <option value="kitchen">Kitchen</option>
                    <option value="bathroom">Bathroom</option>
                    <option value="bedroom">Bedroom</option>
                    <option value="home office">Home Office</option>
                    <option value="porch">Porch</option>
                    <option value="backyard">Backyard/Patio</option>
                  </select>
                </div>
              ))}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="style">Style</label>
            <select
              id="style"
              name="style"
              value={formData.style}
              onChange={handleChange}
            >
              <option value="casual and friendly">Casual & Friendly</option>
              <option value="professional">Professional</option>
              <option value="energetic">Energetic</option>
              <option value="calm and soothing">Calm & Soothing</option>
              <option value="luxury">Luxury</option>
            </select>
          </div>
        </div>

        {/* 5. Production & Story Settings (Combined) */}
        <div className="form-section">
          <h3>Production & Story Settings</h3>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="cameraStyle">Camera Style</label>
              <select
                id="cameraStyle"
                name="cameraStyle"
                value={formData.cameraStyle}
                onChange={handleChange}
              >
                <option value="static-handheld">Static Handheld</option>
                <option value="slow-push">Slow Push In</option>
                <option value="orbit">Subtle Orbit Movement</option>
                <option value="dynamic">Dynamic Handheld</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="timeOfDay">Time of Day / Lighting</label>
              <select
                id="timeOfDay"
                name="timeOfDay"
                value={formData.timeOfDay}
                onChange={handleChange}
              >
                <option value="morning">Morning Light (soft, golden)</option>
                <option value="afternoon">Afternoon Bright (clear, white)</option>
                <option value="golden-hour">Golden Hour (warm, sunset)</option>
                <option value="evening">Cozy Evening (indoor lighting)</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                name="backgroundLife"
                checked={formData.backgroundLife}
                onChange={handleChange}
              />
              Add Background Life (pets, family members, natural sounds)
            </label>
          </div>

          {formData.product && formData.product.trim() !== '' && (
            <div className="form-group">
              <label htmlFor="productStyle">Product Display Style</label>
              <select
                id="productStyle"
                name="productStyle"
                value={formData.productStyle}
                onChange={handleChange}
              >
                <option value="natural">Natural Handling</option>
                <option value="hero-shots">Hero Shots</option>
                <option value="lifestyle-integrated">Lifestyle Integrated</option>
                <option value="demonstration-focused">Demonstration Focused</option>
              </select>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="energyArc">Energy Arc</label>
              <select
                id="energyArc"
                name="energyArc"
                value={formData.energyArc}
                onChange={handleChange}
              >
                <option value="consistent">Consistent Energy</option>
                <option value="building">Building Excitement</option>
                <option value="problem-solution">Problem to Solution</option>
                <option value="discovery">Discovery Journey</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="narrativeStyle">Narrative Style</label>
              <select
                id="narrativeStyle"
                name="narrativeStyle"
                value={formData.narrativeStyle}
                onChange={handleChange}
              >
                <option value="direct-review">Direct Review</option>
                <option value="day-in-life">Day in Life</option>
                <option value="problem-solver">Problem Solver</option>
                <option value="comparison">Comparison Story</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="jsonFormat">JSON Format</label>
            <select
              id="jsonFormat"
              name="jsonFormat"
              value={formData.jsonFormat}
              onChange={handleChange}
            >
              <option value="standard">Standard (300+ words)</option>
              <option value="enhanced">Enhanced Continuity (500+ words)</option>
            </select>
            <p className="form-help-text">
              {formData.jsonFormat === 'enhanced' 
                ? 'Enhanced format includes detailed continuity markers and micro-expressions for seamless transitions'
                : 'Standard format provides comprehensive character and scene descriptions'}
            </p>
          </div>
        </div>

        {/* Ad Strategy Section (only when product is filled) */}
        {formData.product && formData.product.trim() !== '' && (
          <div className="form-section">
            <h3>Ad Strategy (Optional)</h3>
            <p className="form-help-text">
              These fields help optimize your video content for specific marketing objectives and audience awareness levels.
            </p>
          
            <div className="form-group">
              <label htmlFor="awareness">Awareness Level</label>
              <select
                id="awareness"
                name="awareness"
                value={formData.awareness || ''}
                onChange={handleChange}
              >
                <option value="">Select awareness level...</option>
                <option value="unaware">Unaware (don't know they have a problem)</option>
                <option value="problem-aware">Problem Aware (know they have a problem)</option>
                <option value="solution-aware">Solution Aware (know solutions exist)</option>
                <option value="product-aware">Product Aware (know about your product)</option>
                <option value="most-aware">Most Aware (ready to buy)</option>
              </select>
              <p className="form-help-text">
                Where is your audience in the buyer journey? This affects how much explanation vs. demonstration is needed.
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="promise">Product Promise</label>
              <textarea
                id="promise"
                name="promise"
                value={formData.promise || ''}
                onChange={handleChange}
                placeholder="e.g., Lose up to 5% of body weight in 6 months by working WITH hormonal changes rather than against them..."
                rows="2"
              />
              <p className="form-help-text">
                What specific benefit or transformation does your product deliver?
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="patternBreaker">Pattern Breaker</label>
              <textarea
                id="patternBreaker"
                name="patternBreaker"
                value={formData.patternBreaker || ''}
                onChange={handleChange}
                placeholder="e.g., 'Your hormones have fundamentally changed how your body processes food and stores fat' - validating that it's not their fault..."
                rows="2"
              />
              <p className="form-help-text">
                What unique insight or angle breaks through conventional thinking?
              </p>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="headlinePattern">Headline Pattern</label>
                <select
                  id="headlinePattern"
                  name="headlinePattern"
                  value={formData.headlinePattern || ''}
                  onChange={handleChange}
                >
                  <option value="">Select headline pattern...</option>
                  <option value="authority-expert">Authority/Expert</option>
                  <option value="unlikely-hero">Unlikely Hero</option>
                  <option value="open-loop">Open Loop</option>
                  <option value="personal-transformation">Personal Transformation</option>
                  <option value="direct-claim">Direct Claim</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="headline">Headline</label>
                <input
                  type="text"
                  id="headline"
                  name="headline"
                  value={formData.headline || ''}
                  onChange={handleChange}
                  placeholder="e.g., Why Your Body Starts Working Against You After 50"
                />
              </div>
            </div>
          </div>
        )}

        <button 
          type="submit" 
          className="submit-button"
          disabled={loading}
        >
          {loading ? 'Generating...' : 'Generate Continuation'}
        </button>
      </form>

      {error && (
        <div className="error-message">
          <h3>Error</h3>
          <p>{error}</p>
        </div>
      )}

      {results && (
        <div className="results-container">
          <ResultsDisplayContinuation 
            results={results} 
            settings={formData}
          />
          <DownloadButton 
            results={results} 
            filename="continuation-segments.json"
          />
        </div>
      )}
    </div>
  );
}

export default ContinuationMode;