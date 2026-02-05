import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
// Icons
import { 
  Plus, X, Heart, Send, MapPin, Clock, Trash2, AlertCircle, Camera, CheckCircle, Ghost, 
  Shield, Ban, HeartHandshake, User, ArrowRight, Wind, Lock, Globe, Fingerprint, 
  ChevronLeft, ChevronRight, Trophy, Flag 
} from 'lucide-react';
import './App.css';

// --- FIREBASE IMPORTS ---
import { db } from './firebase';
import { 
  collection, addDoc, deleteDoc, doc, updateDoc, getDoc,
  onSnapshot, query, orderBy, arrayUnion, increment 
} from 'firebase/firestore';

// --- CONFIGURATION ---
const MOODS = [
  { id: 'none',      color: '#A1A1AA', label: 'None (Optional)' },
  { id: 'peace',     color: '#60A5FA', label: 'Peaceful' },
  { id: 'happy',     color: '#FFD60A', label: 'Happy' }, 
  { id: 'love',      color: '#FF2D55', label: 'Loved' },
  { id: 'excited',   color: '#FF9500', label: 'Excited' },
  { id: 'sad',       color: '#BF5AF2', label: 'Sad'},
];

const BAD_WORDS = ["fuck", "shit", "bitch", "asshole", "tangina", "gago", "bobo", "putangina", "tanga", "ulol", "yawa", "pisti", "atay", "bilat"];

const filterProfanity = (text) => {
  let cleanText = text;
  BAD_WORDS.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    cleanText = cleanText.replace(regex, "****");
  });
  return cleanText;
};

const getAvatarUrl = (seed) => `https://api.dicebear.com/7.x/micah/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9`;

const getTimeLeft = (timestamp) => {
  const now = Date.now();
  const expiresAt = timestamp + (24 * 60 * 60 * 1000);
  const diff = expiresAt - now;
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "< 1h left";
  return `${hours}h left`;
};

// Animation Variants
const containerVar = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.5 } }
};

const itemVar = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 50, damping: 20 } }
};

const slideVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3, ease: "easeOut" } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.2 } }
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 25 } },
  exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } }
};

export default function HushApp() {
  const [notes, setNotes] = useState([]);
  const [activeNoteId, setActiveNoteId] = useState(null); 
  const [modalMode, setModalMode] = useState(null);
  const [batchIndex, setBatchIndex] = useState(0);
  const BATCH_SIZE = 6;
  
  // Local State
  const [likedIds, setLikedIds] = useState(() => {
    const saved = localStorage.getItem('hush_liked_ids');
    return new Set(saved ? JSON.parse(saved) : []);
  });
  const [likedReplyIds, setLikedReplyIds] = useState(() => {
    const saved = localStorage.getItem('hush_liked_reply_ids');
    return new Set(saved ? JSON.parse(saved) : []);
  });
  const [reportedIds, setReportedIds] = useState(() => {
    const saved = localStorage.getItem('hush_reported_ids');
    return new Set(saved ? JSON.parse(saved) : []);
  });
  
  useEffect(() => { localStorage.setItem('hush_liked_ids', JSON.stringify([...likedIds])); }, [likedIds]);
  useEffect(() => { localStorage.setItem('hush_liked_reply_ids', JSON.stringify([...likedReplyIds])); }, [likedReplyIds]);
  useEffect(() => { localStorage.setItem('hush_reported_ids', JSON.stringify([...reportedIds])); }, [reportedIds]);

  const [toasts, setToasts] = useState([]);
  const audioRef = useRef(null);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showTerms, setShowTerms] = useState(false);

  const [userSeed] = useState(() => {
    const saved = localStorage.getItem("hush_user_seed");
    if (saved) return saved;
    const newSeed = "user_" + Math.random().toString(36).substr(2, 9);
    localStorage.setItem("hush_user_seed", newSeed);
    return newSeed;
  });
  const [myProfileImg, setMyProfileImg] = useState(null);
  
  const myLiveNote = notes.find(n => n.seed === userSeed);
  const activeNote = notes.find(n => n.id === activeNoteId);
  const isMine = activeNote?.seed === userSeed;

  const validNotes = notes.filter(n => getTimeLeft(n.createdAt) !== "Expired" && (n.hushes || 0) < 3);
  const totalBatches = Math.ceil(validNotes.length / BATCH_SIZE);
  
  useEffect(() => {
    if (batchIndex >= totalBatches && totalBatches > 0) {
      setBatchIndex(totalBatches - 1);
    }
  }, [totalBatches, batchIndex]);

  const visibleNotes = validNotes.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);

  const [lastSeenReplyCount, setLastSeenReplyCount] = useState(() => {
    return Number(localStorage.getItem('hush_last_seen_replies') || 0);
  });
  
  const unreadCount = myLiveNote 
    ? Math.max(0, (myLiveNote.replies?.length || 0) - lastSeenReplyCount) 
    : 0;

  useEffect(() => {
    if (modalMode === 'view' && activeNoteId && myLiveNote && activeNoteId === myLiveNote.id) {
      const currentCount = myLiveNote.replies?.length || 0;
      if (currentCount > lastSeenReplyCount) {
        setLastSeenReplyCount(currentCount);
        localStorage.setItem('hush_last_seen_replies', currentCount);
      }
    }
  }, [modalMode, activeNoteId, myLiveNote, lastSeenReplyCount]);

  const [draftName, setDraftName] = useState("");
  const [draftText, setDraftText] = useState("");
  const [selectedMood, setSelectedMood] = useState(MOODS[0]); 
  const [locationName, setLocationName] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [replyText, setReplyText] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    const q = query(collection(db, "notes"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setNotes(notesData);
    });
    return () => unsubscribe();
  }, []);

  const addToast = (msg) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };

  const getCityLeaderboard = () => {
    const counts = {};
    validNotes.forEach(note => {
      const loc = note.location;
      if (loc && !loc.includes("Earth") && !loc.includes("Locating")) { 
        counts[loc] = (counts[loc] || 0) + 1;
      }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  };

  const handleEnterApp = () => {
    setShowWelcome(false);
    setShowTerms(true);
    if (audioRef.current) {
      audioRef.current.volume = 0.2; 
      audioRef.current.play().catch(e => console.log("Audio autoplay blocked until interaction", e));
    }
  };

  const handleAcceptTerms = () => {
    setShowTerms(false);
    addToast("Welcome to Hush."); 
  };

  const handleFabClick = () => {
    if (myLiveNote) setModalMode('alert');
    else setModalMode('compose');
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setUploadedImage(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleLocationToggle = () => {
    if (locationName) setLocationName(null);
    else {
      setIsLocating(true);
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
          try {
            const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&localityLanguage=en`);
            const data = await res.json();
            setLocationName(`${data.city || data.locality}, ${data.countryCode}`);
          } catch { setLocationName("Earth"); }
          setIsLocating(false);
        });
      }
    }
  };

  // --- UPDATED COLLISION DETECTION ALGORITHM ---
  // Increased buffer size to prevent overlapping
  const getSafePosition = (existingNotes) => {
    const maxTries = 100; // More tries to find a spot
    const buffer = 22; // Increased from 15 to 22 (Percentage of screen) to ensure gap
    
    for (let i = 0; i < maxTries; i++) {
      // Tighter bounds to keep notes away from the very edge
      const x = Math.random() * 70 + 15; // 15% to 85% width
      const y = Math.random() * 60 + 20; // 20% to 80% height
      
      const collision = existingNotes.some(n => {
        if (!n.x || !n.y) return false;
        const dx = n.x - x;
        const dy = n.y - y;
        // Check Euclidean distance
        return Math.sqrt(dx*dx + dy*dy) < buffer;
      });

      if (!collision) return { x, y };
    }
    
    // Fallback: Random spot with slight offset if we can't find a perfect one
    return { 
      x: Math.random() * 70 + 15, 
      y: Math.random() * 60 + 20 
    };
  };

  const handlePublish = async () => {
    if (!draftText.trim()) return;
    if (uploadedImage) setMyProfileImg(uploadedImage);

    setLastSeenReplyCount(0);
    localStorage.setItem('hush_last_seen_replies', 0);

    // Calculate safe position based on ALL current notes
    const { x, y } = getSafePosition(notes); 

    const newNote = {
      text: filterProfanity(draftText),
      name: draftName || "Anonymous",
      mood: selectedMood,
      image: uploadedImage, 
      seed: userSeed,
      x, y,
      loves: 0,
      hushes: 0, 
      location: locationName,
      createdAt: Date.now(),
      replies: []
    };

    try {
      await addDoc(collection(db, "notes"), newNote);
      setModalMode(null);
      setDraftName(""); setDraftText(""); setUploadedImage(null);
      setSelectedMood(MOODS[0]); setLocationName(null);
      addToast("Whisper released.");
    } catch (e) { addToast("Error releasing whisper."); }
  };

  const handleDeleteMyNote = async () => {
    if (!myLiveNote) return;
    try {
      await deleteDoc(doc(db, "notes", myLiveNote.id));
      setModalMode(null); setActiveNoteId(null);
      addToast("Note deleted.");
    } catch (e) { addToast("Could not delete."); }
  };

  const handleReportNote = async (noteId) => {
    if (reportedIds.has(noteId)) {
      setModalMode(null);
      addToast("You already reported this.");
      return;
    }
    const noteRef = doc(db, "notes", noteId);
    try {
      await updateDoc(noteRef, { hushes: increment(1) });
      setReportedIds(prev => {
        const next = new Set(prev);
        next.add(noteId);
        return next;
      });
      addToast("Reported. Hush.");
      setModalMode(null); 
    } catch (e) { addToast("Could not report."); }
  };

  const handleLikeNote = async (noteId) => {
    const isLiked = likedIds.has(noteId);
    const newLikedIds = new Set(likedIds);
    if (isLiked) newLikedIds.delete(noteId);
    else newLikedIds.add(noteId);
    setLikedIds(newLikedIds);

    const noteRef = doc(db, "notes", noteId);
    await updateDoc(noteRef, { loves: increment(isLiked ? -1 : 1) });
  };

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    const newReply = { 
      id: Date.now(), text: filterProfanity(replyText), 
      author: "Anonymous", seed: userSeed, image: myProfileImg, loves: 0 
    };
    try {
      const noteRef = doc(db, "notes", activeNoteId);
      await updateDoc(noteRef, { replies: arrayUnion(newReply) });
      setReplyText("");
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e) { addToast("Failed to send."); }
  };

  const handleLikeReply = async (noteId, replyId) => {
    const isLiked = likedReplyIds.has(replyId);
    const newReplyLikes = new Set(likedReplyIds);
    if (isLiked) newReplyLikes.delete(replyId); 
    else newReplyLikes.add(replyId); 
    setLikedReplyIds(newReplyLikes);

    const noteRef = doc(db, "notes", noteId);
    try {
      const noteSnap = await getDoc(noteRef);
      if (noteSnap.exists()) {
        const data = noteSnap.data();
        const updatedReplies = data.replies.map(r => {
          if (r.id === replyId) {
            return { ...r, loves: (r.loves || 0) + (isLiked ? -1 : 1) };
          }
          return r;
        });
        await updateDoc(noteRef, { replies: updatedReplies });
      }
    } catch (e) { console.error(e); }
  };

  const nextBatch = () => setBatchIndex(prev => Math.min(totalBatches - 1, prev + 1));
  const prevBatch = () => setBatchIndex(prev => Math.max(0, prev - 1));

  return (
    <div className="hush-wrapper">
      <div className="premium-bg" />
      <div className="noise-overlay" />
      <audio 
  ref={audioRef} 
  loop 
  src="/music/bg-music.mp3" 
/>

      <AnimatePresence>
        {showWelcome && (
          <motion.div className="welcome-container" variants={containerVar} initial="hidden" animate="visible" exit="exit">
             <div className="welcome-content">
                <div className="title-group">
                  <motion.h1 className="welcome-title" variants={itemVar}>Hush.</motion.h1>
                  <motion.div className="welcome-subtitle" variants={itemVar}>The Quiet Social Network</motion.div>
                </div>
                <motion.div className="feature-grid" variants={containerVar}>
                  <motion.div className="feature-card" variants={itemVar}>
                    <div className="feat-icon"><Wind size={24} /></div>
                    <div className="feat-title">Disappear</div>
                    <div className="feat-desc">Thoughts fade after 24 hours. No history, no regrets.</div>
                  </motion.div>
                  <motion.div className="feature-card" variants={itemVar}>
                    <div className="feat-icon"><Lock size={24} /></div>
                    <div className="feat-title">Anonymous</div>
                    <div className="feat-desc">No profiles to curate. Just pure, unfiltered human emotion.</div>
                  </motion.div>
                   <motion.div className="feature-card" variants={itemVar}>
                    <div className="feat-icon"><Globe size={24} /></div>
                    <div className="feat-title">Global</div>
                    <div className="feat-desc">Connect with souls around the world, completely unseen.</div>
                  </motion.div>
                </motion.div>
                <motion.button className="btn-enter-glow" onClick={handleEnterApp} variants={itemVar} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  Enter
                </motion.button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTerms && (
          <div className="backdrop">
            <motion.div className="manifesto-container" variants={modalVariants} initial="hidden" animate="visible" exit="exit">
               <h2 className="manifesto-title">The Code of Silence</h2>
               <div className="rule-row"><div className="rule-num">01</div><div className="rule-content"><h4>Be Kind, Always</h4><p>Behind every anonymous dot is a real human heart. Treat them gently.</p></div></div>
               <div className="rule-row"><div className="rule-num">02</div><div className="rule-content"><h4>Protect Identity</h4><p>Do not share names, addresses, or socials. This is a sanctuary, not a marketplace.</p></div></div>
               <div className="rule-row"><div className="rule-num">03</div><div className="rule-content"><h4>One Voice</h4><p>You may only whisper once every 24 hours. Make it count.</p></div></div>
               <button className="btn-primary" onClick={handleAcceptTerms} style={{width:'100%', marginTop: 24, fontSize: '1rem'}}>I Agree</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {!showWelcome && !showTerms && (
        <>
          <motion.div style={{position: 'absolute', top: 50, left: 40, zIndex: 50}} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
            <h1 style={{fontFamily: 'Playfair Display', fontSize: '3.5rem', margin: 0, color: 'white', letterSpacing: '-1.5px', fontStyle: 'italic'}}>Hush.</h1>
            <span style={{fontSize: '0.95rem', opacity: 0.6, letterSpacing: '0.5px', fontWeight: 400}}>A quiet space for loud minds.</span>
          </motion.div>

          <div className="toast-container">
            <AnimatePresence>
              {toasts.map(t => (
                <motion.div key={t.id} className="toast-msg" initial={{opacity:0, y:-30}} animate={{opacity:1, y:0}} exit={{opacity:0}}>
                  <CheckCircle size={16} color="#34C759" /> {t.msg}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <motion.div className="leaderboard-card" initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} transition={{delay:1}}>
             <div className="lb-header"><Trophy size={16} color="#FFD700" /><span>City Leaderboard</span></div>
             <div className="lb-list">
               {getCityLeaderboard().length > 0 ? getCityLeaderboard().map(([city, count], idx) => (
                 <div key={city} className="lb-row">
                    <div className="lb-rank-col"><span>#{idx+1}</span><span>{city}</span></div>
                    <span className="lb-badge">{count}</span>
                 </div>
               )) : <div style={{fontSize:'0.75rem', color:'#666', textAlign:'center', padding:10}}>Waiting for whispers...</div>}
             </div>
          </motion.div>

          {validNotes.length === 0 && (
            <motion.div className="empty-state" initial={{opacity:0}} animate={{opacity:1}} transition={{delay: 1}}>
              <div className="ghost-icon"><Ghost size={32} color="white" /></div>
              <div className="empty-text">It's quiet here...</div>
              <div style={{fontSize: '0.9rem', color: '#666', marginTop: 8}}>Be the first to whisper.</div>
            </motion.div>
          )}

          {/* SVG Connection Strings Removed Here */}

          <AnimatePresence mode="wait">
            <motion.div 
              key={batchIndex} 
              initial="hidden" animate="visible" exit="exit" variants={slideVariants}
              style={{position: 'absolute', inset: 0, pointerEvents: 'none'}} 
            >
              {[...visibleNotes].sort((a,b) => a.mood.id.localeCompare(b.mood.id)).map((note) => {
                const glowColor = note.mood?.id === 'none' ? 'rgba(255,255,255,0.4)' : note.mood?.color || '#fff';
                const isMineNote = note.seed === userSeed;

                return (
                  <motion.div
                    key={note.id}
                    className="orb-container"
                    style={{ left: `${note.x}%`, top: `${note.y}%`, pointerEvents: 'auto' }} 
                    initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                  >
                    <motion.div 
                      className="note-pill"
                      style={{ borderColor: glowColor }}
                      animate={{ y: [0, -10, 0] }}
                      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: Math.random() * 2 }}
                      onClick={() => { setActiveNoteId(note.id); setModalMode('view'); }}
                    >
                      "{note.text.substring(0, 20)}{note.text.length > 20 && "..."}"
                    </motion.div>

                    <div className="avatar-wrapper" onClick={() => { setActiveNoteId(note.id); setModalMode('view'); }}>
                        <div className="pulse-ring" style={{borderColor: glowColor}} />
                        <div className="avatar-glass" style={{borderColor: isMineNote ? '#fff' : 'rgba(255,255,255,0.15)'}}>
                          <img src={note.image || getAvatarUrl(note.seed)} className="avatar-img" alt="av" />
                          {isMineNote && <div style={{position:'absolute', bottom:4, right:4, width:10, height:10, background:'white', borderRadius:'50%'}} />}
                        </div>
                        {isMineNote && unreadCount > 0 && (
                           <div className="orb-badge">{unreadCount}</div>
                        )}
                    </div>
                  </motion.div>
                )
              })}
            </motion.div>
          </AnimatePresence>

          {totalBatches > 1 && (
            <div className="batch-controls">
              <button className="nav-arrow" onClick={prevBatch} disabled={batchIndex === 0}><ChevronLeft size={24}/></button>
              <span className="batch-indicator">{batchIndex + 1} / {totalBatches}</span>
              <button className="nav-arrow" onClick={nextBatch} disabled={batchIndex === totalBatches - 1}><ChevronRight size={24}/></button>
            </div>
          )}

          <motion.button className="fab-main" onClick={handleFabClick} initial={{ scale: 0 }} animate={{ scale: 1 }}>
            {myLiveNote ? <User size={28} /> : <Plus size={32} />}
          </motion.button>
        </>
      )}

      <AnimatePresence>
        {modalMode === 'compose' && (
          <div className="backdrop">
            <motion.div className="glass-panel" variants={modalVariants} initial="hidden" animate="visible" exit="exit">
              <div className="panel-header" style={{justifyContent: 'center', borderBottom: 'none'}}>
                <h2 style={{fontWeight: 600, margin: 0, fontSize: '1.2rem'}}>Share your feelings</h2>
              </div>
              <div className="panel-content" style={{paddingTop: 10}}>
                <div className="upload-container">
                  <label className="upload-circle">
                    {uploadedImage ? <img src={uploadedImage} className="upload-preview" /> : 
                      <div style={{textAlign:'center'}}>
                         <img src={getAvatarUrl(userSeed)} style={{width:88, height:88, opacity: 0.4}} />
                         <div style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.3)'}}>
                           <Camera size={24} className="upload-icon" />
                         </div>
                      </div>
                    }
                    <input type="file" accept="image/*" className="hidden-input" onChange={handleImageUpload} />
                  </label>
                </div>
                <div className="mood-grid">
                  {MOODS.map(m => (
                    <div key={m.id} onClick={() => setSelectedMood(m)}
                      className={`mood-circle ${m.id === 'none' ? 'none-opt' : ''} ${selectedMood.id === m.id ? 'selected' : ''}`}
                      style={{ backgroundColor: m.id === 'none' ? 'transparent' : m.color }} 
                    />
                  ))}
                </div>
                <div style={{textAlign: 'center', color: selectedMood.color || '#888', marginBottom: 20, fontSize: '0.85rem', fontWeight: 600}}>
                   {selectedMood.label}
                </div>
                <input className="input-minimal" placeholder="Your Name (Optional)" value={draftName} onChange={e => setDraftName(e.target.value)} />
                <div className="toggle-row" style={{display:'flex', justifyContent:'space-between', marginTop: 20}}>
                   <span style={{fontSize: '0.95rem', color: '#888'}}>Add Location</span>
                   <div style={{display:'flex', alignItems:'center', gap: 10}}>
                      <span style={{fontSize: '0.8rem', color: '#34d399'}}>{isLocating ? "..." : locationName}</span>
                      <div className={`toggle-switch ${locationName ? 'on' : ''}`} onClick={handleLocationToggle}><div className="toggle-thumb" /></div>
                   </div>
                </div>
                <textarea className="input-minimal" rows={3} placeholder="What's weighing on you?" style={{resize: 'none', marginTop: 10, borderBottom: 'none', fontSize: '1.1rem'}} value={draftText} onChange={e => setDraftText(e.target.value)} />
              </div>
              <div className="panel-footer" style={{background: 'none', borderTop:'none'}}>
                <div style={{display: 'flex', gap: 12}}>
                  <button className="btn-primary" onClick={handlePublish}>Release</button>
                  <button className="btn-ghost" onClick={() => setModalMode(null)}>Cancel</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {modalMode === 'view' && activeNote && (
          <div className="backdrop" onClick={() => setModalMode(null)}>
            <motion.div className="glass-panel" onClick={e => e.stopPropagation()} variants={modalVariants} initial="hidden" animate="visible" exit="exit">
              <div className="panel-header">
                 <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
                    <img src={activeNote.image || getAvatarUrl(activeNote.seed)} style={{width: 52, height: 52, borderRadius: '50%', background: '#111', border: '1px solid #333', objectFit:'cover'}} />
                    <div>
                      <h3 style={{margin: 0, fontSize: '1.1rem', fontWeight: 700}}>{activeNote.name}</h3>
                      <div className="badge-row">
                        {activeNote.location && <span className="badge-pill"><MapPin size={10} /> {activeNote.location}</span>}
                        <span className="badge-pill"><Clock size={10} /> {getTimeLeft(activeNote.createdAt)}</span>
                      </div>
                    </div>
                 </div>
                 <button onClick={() => setModalMode(null)} style={{background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: 4}}><X /></button>
              </div>
              <div className="panel-content">
                <div style={{margin: '30px 0', fontSize: '1.25rem', lineHeight: '1.6', textAlign: 'center', color: '#fff', fontWeight: 500}}>"{activeNote.text}"</div>
                <div style={{textAlign: 'center'}}>
                  <button className={`heart-pill ${likedIds.has(activeNote.id) ? 'active' : ''}`} onClick={() => handleLikeNote(activeNote.id)} disabled={isMine}>
                    <Heart size={18} fill={likedIds.has(activeNote.id) ? "currentColor" : "none"} strokeWidth={2.5} /> {activeNote.loves}
                  </button>
                </div>
                <div className="reply-list">
                  <span style={{fontSize: '0.7rem', color:'#52525b', textTransform:'uppercase', letterSpacing:'1px', display:'block', textAlign:'center', marginBottom: 20}}>
                     {activeNote.replies?.length > 0 ? "" : "IT'S QUIET HERE..."}
                  </span>
                  {activeNote.replies?.map(reply => (
                    <motion.div key={reply.id} className="reply-item" initial={{opacity:0, y:10}} animate={{opacity:1, y:0}}>
                      <img src={reply.image || getAvatarUrl(reply.seed)} className="reply-avatar-img" />
                      <div className="reply-bubble-container">
                        <div className="reply-bubble">{reply.text}</div>
                        <button 
                          className={`reply-heart-btn ${likedReplyIds.has(reply.id) ? 'liked' : ''}`} 
                          onClick={() => handleLikeReply(activeNote.id, reply.id)}
                        >
                          <Heart size={12} fill={likedReplyIds.has(reply.id) ? "currentColor" : "none"} /> 
                          {reply.loves > 0 && reply.loves}
                        </button>
                      </div>
                    </motion.div>
                  ))}
                  <div ref={scrollRef} />
                </div>
              </div>
              <div className="panel-footer">
                {isMine ? (
                  <button className="btn-danger" onClick={() => setModalMode('delete_confirm')}>
                    <Trash2 size={18} /> Delete My Note
                  </button>
                ) : (
                  <div className="input-group-wrapper">
                    <button className="btn-report" onClick={() => setModalMode('report_confirm')} title="Report this note">
                      <Flag size={24} />
                    </button>
                    <div className="input-bar" style={{flex:1}}>
                      <input className="chat-input" placeholder="Send a whisper..." value={replyText} onChange={e => setReplyText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendReply()} />
                      <button className="send-btn-circle" onClick={handleSendReply} disabled={!replyText.trim()}>
                        <Send size={16} color="black" strokeWidth={3} style={{ marginLeft: -2 }} /> 
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {modalMode === 'report_confirm' && (
          <div className="backdrop">
            <motion.div className="glass-panel" style={{height: 'auto', width: 340}} variants={modalVariants} initial="hidden" animate="visible" exit="exit">
               <div className="panel-content" style={{padding: '40px 30px', textAlign: 'center'}}>
                  <div style={{width:60, height:60, background: 'rgba(239, 68, 68, 0.1)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px'}}>
                    <Flag size={32} color="#ef4444" />
                  </div>
                  <h2 style={{marginTop: 0, fontWeight: 600, fontSize: '1.25rem'}}>Hush this thought?</h2>
                  <p style={{opacity: 0.6, lineHeight: 1.5, fontSize: '0.95rem'}}>
                    If you report this note, it will fade away for everyone after 3 reports.
                  </p>
                  <div style={{display: 'flex', flexDirection: 'column', gap: 12, marginTop: 30}}>
                    <button className="btn-danger" onClick={() => handleReportNote(activeNote.id)}>Yes, Hush It</button>
                    <button className="btn-ghost" onClick={() => setModalMode('view')}>Cancel</button>
                  </div>
               </div>
            </motion.div>
          </div>
        )}

        {modalMode === 'delete_confirm' && (
          <div className="backdrop">
            <motion.div className="glass-panel" style={{height: 'auto', width: 340}} variants={modalVariants} initial="hidden" animate="visible" exit="exit">
               <div className="panel-content" style={{padding: '40px 30px', textAlign: 'center'}}>
                  <div style={{width:60, height:60, background: 'rgba(239, 68, 68, 0.1)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px'}}>
                    <Trash2 size={32} color="#ef4444" />
                  </div>
                  <h2 style={{marginTop: 0, fontWeight: 600, fontSize: '1.25rem'}}>Are you sure?</h2>
                  <p style={{opacity: 0.6, lineHeight: 1.5, fontSize: '0.95rem'}}>
                    This will permanently delete your note and all replies. This action cannot be undone.
                  </p>
                  <div style={{display: 'flex', flexDirection: 'column', gap: 12, marginTop: 30}}>
                    <button className="btn-danger" onClick={handleDeleteMyNote}>Yes, Delete It</button>
                    <button className="btn-ghost" onClick={() => setModalMode('view')}>Cancel</button>
                  </div>
               </div>
            </motion.div>
          </div>
        )}

        {modalMode === 'alert' && (
          <div className="backdrop">
            <motion.div className="glass-panel" style={{height: 'auto', width: 340}} variants={modalVariants} initial="hidden" animate="visible" exit="exit">
              <div className="panel-content" style={{padding: '40px 30px', textAlign: 'center'}}>
                <div style={{width:60, height:60, background: 'rgba(239, 68, 68, 0.1)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px'}}>
                  <AlertCircle size={32} color="#ef4444" />
                </div>
                <h2 style={{marginTop: 0, fontWeight: 600, fontSize: '1.25rem'}}>One thought at a time</h2>
                <p style={{opacity: 0.6, lineHeight: 1.5, fontSize: '0.95rem'}}>To keep the space quiet, you can only share one thought every 24 hours.</p>
                <div style={{display: 'flex', flexDirection: 'column', gap: 12, marginTop: 30}}>
                  <button className="btn-primary" onClick={() => { 
                     const myNote = notes.find(n => n.seed === userSeed);
                     if(myNote) { 
                       setActiveNoteId(myNote.id);
                       setModalMode('view'); 
                       const count = myNote.replies?.length || 0;
                       setLastSeenReplyCount(count);
                       localStorage.setItem('hush_last_seen_replies', count);
                     }
                  }}>View My Note</button>
                  <button className="btn-ghost" onClick={() => setModalMode(null)}>Close</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}