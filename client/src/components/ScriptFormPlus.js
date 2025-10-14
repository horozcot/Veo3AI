import React, { useState, useEffect, useCallback } from 'react';
import { VOICE_TYPES } from '../voiceTypes';
import { CAMERA_STYLE_DESCRIPTIONS } from '../srcCameraStyles';

function ScriptFormPlus({ onSubmit, loading }) {
  const [formData, setFormData] = useState({
    script: '',
    targetWordsPerSegment: 20,
    showPreview: false,
    ageRange: '25-34',
    gender: 'female',
    voiceType: 'warm-friendly',
    energyLevel: 80,
    ethnicity: '',
    characterFeatures: '',
    clothingDetails: '',
    accentRegion: 'neutral-american',
    coreDesire: '',
    product: '',
    awareness: '',
    promise: '',
    patternBreaker: '',
    headlinePattern: '',
    headline: '',
    creativeType: 'traditional-ugc',
    settingMode: 'ai-inspired', // default to AI Inspired in Plus
    room: 'living room',
    style: 'casual and friendly',
    jsonFormat: 'standard',
    cameraStyle: 'ai-inspired',
    timeOfDay: 'morning',
    backgroundLife: false,
    productStyle: '',
    energyArc: 'consistent',
    narrativeStyle: 'direct-review',
    locations: []
  });

  const [scriptPreview, setScriptPreview] = useState([]);
  const [savedSettings, setSavedSettings] = useState([]);

  useEffect(() => {
    const saved = localStorage.getItem('ugcScriptSettingsPlus');
    if (saved) {
      try {
        setSavedSettings(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load saved settings:', e);
      }
    }
  }, []);

  useEffect(() => {
    if (formData.settingMode === 'single') {
      setFormData(prev => ({ ...prev, locations: [prev.room] }));
    } else {
      const scriptWords = formData.script.trim().split(/\s+/).length;
      const estimatedSegments = Math.ceil(scriptWords / formData.targetWordsPerSegment);
      const newLocations = Array(estimatedSegments).fill('living room');
      setFormData(prev => ({ ...prev, locations: newLocations }));
    }
  }, [formData.settingMode, formData.room, formData.script, formData.targetWordsPerSegment]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (type === 'checkbox') {
      setFormData({
        ...formData,
        [name]: checked
      });
    } else if (name === 'settingMode') {
      let defaultLocations = [];
      if (value === 'home-tour') {
        defaultLocations = ['living room', 'kitchen', 'bedroom', 'home office'];
      } else if (value === 'indoor-outdoor') {
        defaultLocations = ['living room', 'porch', 'kitchen', 'backyard'];
      } else if (value === 'ai-inspired') {
        defaultLocations = [];
      }

      setFormData({
        ...formData,
        [name]: value,
        locations: defaultLocations
      });
    } else {
      const newData = {
        ...formData,
        [name]: value
      };
      
      // Clear productStyle when product is empty
      if (name === 'product' && (!value || value.trim() === '')) {
        newData.productStyle = '';
      }
      
      setFormData(newData);
    }
  };

  const handleLocationChange = (index, value) => {
    const newLocations = [...formData.locations];
    newLocations[index] = value;
    setFormData({
      ...formData,
      locations: newLocations
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const previewScript = useCallback(() => {
    if (!formData.script || formData.script.trim().length < 50) {
      setScriptPreview([]);
      return;
    }

    const targetWords = parseInt(formData.targetWordsPerSegment) || 20;
    const minWords = Math.max(15, targetWords - 5);
    const maxWords = targetWords + 2;

    const sentences = formData.script.match(/[^.!?]+[.!?]+/g) || [formData.script];

    const segments = [];
    let currentSegment = [];
    let currentWordCount = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      const words = sentence.split(/\s+/);
      
      currentSegment.push(sentence);
      currentWordCount += words.length;

      if (currentWordCount >= minWords || i === sentences.length - 1) {
        const segmentText = currentSegment.join(' ');
        const duration = Math.max(6, (currentWordCount / 2.5));
        
        segments.push({
          text: segmentText,
          wordCount: currentWordCount,
          duration: duration
        });

        currentSegment = [];
        currentWordCount = 0;
      }
    }

    setScriptPreview(segments);
  }, [formData.script, formData.targetWordsPerSegment]);

  useEffect(() => {
    previewScript();
  }, [previewScript]);

  const saveSettings = () => {
    const name = prompt('Enter a name for these settings:');
    if (name && name.trim()) {
      const newSetting = {
        name: name.trim(),
        settings: formData,
        date: new Date().toLocaleDateString()
      };
      const updated = [...savedSettings, newSetting];
      localStorage.setItem('ugcScriptSettingsPlus', JSON.stringify(updated));
      setSavedSettings(updated);
    }
  };

  const loadSettings = (settingName) => {
    const setting = savedSettings.find(s => s.name === settingName);
    if (setting) {
      setFormData({
        ...formData,
        ...setting.settings,
        script: formData.script,
        showPreview: false
      });
      alert(`Settings "${settingName}" loaded!`);
    }
  };

  const deleteSettings = (settingName) => {
    if (window.confirm(`Delete settings "${settingName}"?`)) {
      const updated = savedSettings.filter(s => s.name !== settingName);
      localStorage.setItem('ugcScriptSettingsPlus', JSON.stringify(updated));
      setSavedSettings(updated);
    }
  };

  return (
    <form className="form-container" onSubmit={handleSubmit}>
      <div className="settings-controls">
        <h3>Settings Management (Standard Plus)</h3>
        <div className="settings-buttons">
          <button
            type="button"
            className="settings-button save-button"
            onClick={saveSettings}
          >
            💾 Save Current Settings
          </button>

          {savedSettings.length > 0 && (
            <div className="saved-settings-list">
              <label>Load Saved Settings:</label>
              <select
                onChange={(e) => e.target.value && loadSettings(e.target.value)}
                defaultValue=""
              >
                <option value="">Select settings to load...</option>
                {savedSettings.map((setting) => (
                  <option key={setting.name} value={setting.name}>
                    {setting.name} ({setting.date})
                  </option>
                ))}
              </select>
              {savedSettings.map((setting) => (
                <button
                  key={`delete-${setting.name}`}
                  type="button"
                  className="delete-settings-btn"
                  onClick={() => deleteSettings(setting.name)}
                  title={`Delete ${setting.name}`}
                >
                  🗑️
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 1. Script Section */}
      <div className="form-section">
        <h3>Script</h3>
        <div className="form-group">
          <label htmlFor="script">Script *</label>
          <textarea
            id="script"
            name="script"
            value={formData.script}
            onChange={handleChange}
            placeholder="Paste your UGC script here (minimum 50 characters)..."
            required
            minLength={50}
          />
          <p className="form-help-text">
            Each segment needs 15-22 words (6-8 seconds of speaking). Short sentences will be automatically combined.
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="targetWordsPerSegment">Words per Segment (Target: {formData.targetWordsPerSegment})</label>
          <input
            type="range"
            id="targetWordsPerSegment"
            name="targetWordsPerSegment"
            value={formData.targetWordsPerSegment}
            onChange={handleChange}
            min="15"
            max="30"
            step="1"
          />
          <p className="form-help-text">
            Adjust the target word count per 8-second segment (15 = slower pace, 30 = faster pace)
          </p>
        </div>

        {formData.script && formData.script.trim().length >= 50 && (
          <div className="form-group">
            <button
              type="button"
              className="preview-button"
              onClick={() => setFormData({ ...formData, showPreview: !formData.showPreview })}
            >
              {formData.showPreview ? 'Hide' : 'Show'} Script Preview
            </button>
          </div>
        )}

        {formData.showPreview && scriptPreview.length > 0 && (
          <div className="script-preview">
            <h3>Script Preview - {scriptPreview.length} Segments</h3>
            <p className="preview-info">
              Total duration: ~{scriptPreview.reduce((sum, seg) => sum + seg.duration, 0).toFixed(1)} seconds
            </p>
            <div className="preview-segments">
              {scriptPreview.map((segment, index) => (
                <div key={index} className="preview-segment">
                  <div className="preview-segment-header">
                    <span className="segment-number">Segment {index + 1}</span>
                    <span className="segment-stats">
                      {segment.wordCount} words | ~{segment.duration}s
                    </span>
                  </div>
                  <div className="preview-segment-text">
                    {segment.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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
            <p className="form-help-text">
              Sets the vocal tone and delivery style for consistency across segments
            </p>
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
            <p className="form-help-text">
              Base energy level for delivery (50% = calm, 100% = highly enthusiastic)
            </p>
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
            <p className="form-help-text">
              Add specific physical features to make the character more distinctive
            </p>
          </div>

          <div className="form-group">
            <label htmlFor="clothingDetails">Clothing Details (Optional)</label>
            <input
              type="text"
              id="clothingDetails"
              name="clothingDetails"
              value={formData.clothingDetails || ''}
              onChange={handleChange}
              placeholder="e.g., casual jeans and t-shirt, business casual, athleisure..."
            />
            <p className="form-help-text">
              Describe the character's typical clothing style
            </p>
          </div>

          <div className="form-group">
            <label htmlFor="coreDesire">Core Desire (Optional)</label>
            <textarea
              id="coreDesire"
              name="coreDesire"
              value={formData.coreDesire}
              onChange={handleChange}
              placeholder="e.g., To feel in control of their body again and lose weight without fighting against their hormonal reality..."
              rows="2"
            />
            <p className="form-help-text">
              What does your persona most want to achieve or feel?
            </p>
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
            <option value="ai-inspired">AI Inspired (director's choice)</option>
            <option value="single">Single Location</option>
            <option value="home-tour">Mixed Locations - Home Tour</option>
            <option value="indoor-outdoor">Mixed Locations - Indoor/Outdoor</option>
          </select>
          <p className="form-help-text">
            {formData.settingMode === 'ai-inspired' 
              ? 'AI will automatically select the best locations for each segment'
              : formData.settingMode === 'single'
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
        ) : formData.settingMode !== 'ai-inspired' ? (
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
        ) : null}

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

      {/* 5. Visual & Production + Story & Presentation (Combined) */}
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
              <option value="ai-inspired">AI Inspired (director's choice)</option>
              <option value="static-handheld">Static Handheld</option>
              <option value="slow-push">Slow Push In</option>
              <option value="orbit">Subtle Orbit Movement</option>
              <option value="dynamic">Dynamic Handheld</option>
            </select>
            <p className="form-help-text">
              {CAMERA_STYLE_DESCRIPTIONS[formData.cameraStyle] || 'Choose a camera behavior for the segment.'}
            </p>
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

        <div className="form-group">
          <label htmlFor="creativeType">Creative Type</label>
          <select
            id="creativeType"
            name="creativeType"
            value={formData.creativeType}
            onChange={handleChange}
          >
            <option value="traditional-ugc">Traditional UGC Video</option>
            <option value="vsl-opener">VSL Opener</option>
            <option value="rant-style">Rant Style Video</option>
            <option value="non-narrated">Non-narrated Video</option>
            <option value="ai-narrated">AI-narrated Video</option>
            <option value="arcards">Arcards Video</option>
            <option value="mashup">Mashup Video</option>
            <option value="mini-vsl">Mini VSL (1-3min)</option>
            <option value="long-vsl">Long VSLs (3+ mins)</option>
            <option value="interview">Interview</option>
            <option value="organic">Organic</option>
            <option value="human-voiceover">Human Voiceover</option>
            <option value="professional-studio">Professional Studio</option>
            <option value="static-image">Static Image</option>
            <option value="carousel">Carousel</option>
            <option value="motion-graphics">Motion Graphics</option>
            <option value="giphy">Giphy</option>
            <option value="advertorial">Advertorial</option>
            <option value="listicle">Listicle</option>
            <option value="pdp">PDP</option>
          </select>
          <p className="form-help-text">
            Choose the video format/style that best matches your marketing objective.
          </p>
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
              <option value="natural">Natural Integration</option>
              <option value="showcase">Feature Showcase</option>
              <option value="before-after">Before/After Demo</option>
              <option value="lifestyle">Lifestyle Context</option>
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
              value={formData.awareness}
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
              value={formData.promise}
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
              value={formData.patternBreaker}
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
                value={formData.headlinePattern}
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
                value={formData.headline}
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
        {loading ? 'Generating...' : 'Generate'}
      </button>
    </form>
  );
}

export default ScriptFormPlus;