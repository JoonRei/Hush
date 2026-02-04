import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Heart, Send, User, MapPin, Clock, Trash2, AlertCircle, Camera, CheckCircle } from 'lucide-react';
import './App.css';

// --- FIREBASE IMPORTS ---
import { db } from './firebase';
import { 
  collection, addDoc, deleteDoc, doc, updateDoc, 
  onSnapshot, query, orderBy, arrayUnion, arrayRemove, increment 
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
const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 25 } },
  exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } }
};

const replyVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
};

export default function HushApp() {
  const [notes, setNotes] = useState([]);
  const [activeNote, setActiveNote] = useState(null);
  const [modalMode, setModalMode] = useState(null);
  const [likedIds, setLikedIds] = useState(new Set()); 
  const [toasts, setToasts] = useState([]);

  // --- USER IDENTITY ---
  // Save ID to localStorage so it persists on refresh
  const [userSeed] = useState(() => {
    const saved = localStorage.getItem("hush_user_seed");
    if (saved) return saved;
    const newSeed = "user_" + Math.random().toString(36).substr(2, 9);
    localStorage.setItem("hush_user_seed", newSeed);
    return newSeed;
  });
  
  const [myProfileImg, setMyProfileImg] = useState(null);

  // --- DERIVED STATE ---
  // Check if current user already has a live note in the list
  const myLiveNote = notes.find(n => n.seed === userSeed);

  // Form States
  const [draftName, setDraftName] = useState("");
  const [draftText, setDraftText] = useState("");
  const [selectedMood, setSelectedMood] = useState(MOODS[0]); 
  const [locationName, setLocationName] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [replyText, setReplyText] = useState("");
  const scrollRef = useRef(null);

  // --- 1. REAL-TIME DATABASE LISTENER ---
  useEffect(() => {
    // Listen to 'notes' collection, ordered by creation time
    const q = query(collection(db, "notes"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setNotes(notesData);
      
      // If a note is currently open, keep it updated in real-time
      if (activeNote) {
        const updatedActive = notesData.find(n => n.id === activeNote.id);
        if (updatedActive) setActiveNote(updatedActive);
      }
    });
    return () => unsubscribe();
  }, [activeNote]); // Dependency ensures active view stays fresh

  // --- ACTIONS ---

  const addToast = (msg) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
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

  const handlePublish = async () => {
    if (!draftText.trim()) return;

    if (uploadedImage) setMyProfileImg(uploadedImage);

    const newNote = {
      text: filterProfanity(draftText),
      name: draftName || "Anonymous",
      mood: selectedMood, // Ensure this object is clean JSON
      image: uploadedImage, 
      seed: userSeed, // This links the note to YOU
      x: Math.random() * 60 + 20,
      y: Math.random() * 50 + 20,
      loves: 0,
      location: locationName,
      createdAt: Date.now(),
      replies: []
    };

    try {
      await addDoc(collection(db, "notes"), newNote);
      setModalMode(null);
      // Reset Form
      setDraftName(""); setDraftText(""); setUploadedImage(null);
      setSelectedMood(MOODS[0]); setLocationName(null);
      addToast("Whisper released.");
    } catch (e) {
      console.error(e);
      addToast("Error releasing whisper.");
    }
  };

  const handleDeleteMyNote = async () => {
    if (!myLiveNote) return;
    try {
      await deleteDoc(doc(db, "notes", myLiveNote.id));
      setModalMode(null);
      setActiveNote(null);
      addToast("Note deleted.");
    } catch (e) {
      addToast("Could not delete.");
    }
  };

  const handleLikeNote = async (noteId) => {
    // Check local like state
    const isLiked = likedIds.has(noteId);
    const newLikedIds = new Set(likedIds);
    
    // Optimistic UI Update (Fast)
    if (isLiked) newLikedIds.delete(noteId);
    else newLikedIds.add(noteId);
    setLikedIds(newLikedIds);

    // Database Update
    const noteRef = doc(db, "notes", noteId);
    await updateDoc(noteRef, {
      loves: increment(isLiked ? -1 : 1)
    });
  };

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    
    const newReply = { 
      id: Date.now(), // Simple ID
      text: filterProfanity(replyText), 
      author: "Anonymous",
      seed: userSeed,
      image: myProfileImg 
    };

    try {
      const noteRef = doc(db, "notes", activeNote.id);
      await updateDoc(noteRef, {
        replies: arrayUnion(newReply)
      });
      setReplyText("");
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e) {
      addToast("Failed to send.");
    }
  };

  return (
    <div className="hush-wrapper">
      <div className="premium-bg" />
      <div className="noise-overlay" />
      
      {/* HEADER */}
      <motion.div 
        style={{position: 'absolute', top: 50, left: 40, zIndex: 50}}
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1 }}
      >
        <h1 style={{fontFamily: 'Playfair Display', fontSize: '3.5rem', margin: 0, color: 'white', letterSpacing: '-1.5px'}}>Hush.</h1>
        <span style={{fontSize: '0.95rem', opacity: 0.6, letterSpacing: '0.5px', fontWeight: 400}}>A quiet space for loud minds.</span>
      </motion.div>

      {/* TOASTS */}
      <div className="toast-container">
        <AnimatePresence>
          {toasts.map(t => (
             <motion.div key={t.id} className="toast-msg" initial={{opacity:0, y:-30}} animate={{opacity:1, y:0}} exit={{opacity:0}}>
               <CheckCircle size={16} color="#34C759" /> {t.msg}
             </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {notes.map((note) => {
          if (getTimeLeft(note.createdAt) === "Expired") return null;
          const glowColor = note.mood?.id === 'none' ? 'rgba(255,255,255,0.4)' : note.mood?.color || '#fff';
          // Check if this note belongs to the current user
          const isMine = note.seed === userSeed;

          return (
            <motion.div
              key={note.id}
              className="orb-container"
              style={{ left: `${note.x}%`, top: `${note.y}%` }}
              initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
            >
              <motion.div 
                className="note-pill"
                style={{ borderColor: glowColor }}
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: Math.random() * 2 }}
                onClick={() => { setActiveNote({...note, isMine}); setModalMode('view'); }}
              >
                "{note.text.substring(0, 20)}{note.text.length > 20 && "..."}"
              </motion.div>

              <motion.div 
                className="avatar-glass"
                style={{ borderColor: glowColor }}
                onClick={() => { setActiveNote({...note, isMine}); setModalMode('view'); }}
              >
                <img src={note.image || getAvatarUrl(note.seed)} className="avatar-img" alt="av" />
                {isMine && <div style={{position:'absolute', bottom:4, right:4, width:10, height:10, background:'white', borderRadius:'50%'}} />}
              </motion.div>
            </motion.div>
          )
        })}
      </AnimatePresence>

      <motion.button 
        className="fab-main" 
        onClick={handleFabClick}
        initial={{ scale: 0 }} animate={{ scale: 1 }}
      >
        {myLiveNote ? (
          <img src={myProfileImg || getAvatarUrl(userSeed)} className="fab-img" alt="me" />
        ) : (
          <Plus size={32} />
        )}
      </motion.button>

      <AnimatePresence>
        {/* --- COMPOSE MODAL --- */}
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

        {/* --- VIEW MODAL --- */}
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
                  <button className={`heart-pill ${likedIds.has(activeNote.id) ? 'active' : ''}`} onClick={() => handleLikeNote(activeNote.id)} disabled={activeNote.isMine}>
                    <Heart size={18} fill={likedIds.has(activeNote.id) ? "currentColor" : "none"} strokeWidth={2.5} /> {activeNote.loves}
                  </button>
                </div>

                <div className="reply-list">
                  <span style={{fontSize: '0.7rem', color:'#52525b', textTransform:'uppercase', letterSpacing:'1px', display:'block', textAlign:'center', marginBottom: 20}}>
                     {activeNote.replies?.length > 0 ? "" : "IT'S QUIET HERE..."}
                  </span>
                  {activeNote.replies?.map(reply => (
                    <motion.div key={reply.id} className="reply-item" variants={replyVariants} initial="hidden" animate="visible">
                      <img src={reply.image || getAvatarUrl(reply.seed)} className="reply-avatar-img" />
                      <div className="reply-bubble">{reply.text}</div>
                    </motion.div>
                  ))}
                  <div ref={scrollRef} />
                </div>
              </div>

              <div className="panel-footer">
                {activeNote.isMine ? (
                  <button className="btn-danger" onClick={handleDeleteMyNote}>
                    <Trash2 size={18} /> Delete My Note
                  </button>
                ) : (
                  <div className="input-bar">
                    <input className="chat-input" placeholder="Send a whisper..." value={replyText} onChange={e => setReplyText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendReply()} />
                    <button className="send-btn-circle" onClick={handleSendReply} disabled={!replyText.trim()}>
                      <Send size={16} color="black" strokeWidth={3} style={{ marginLeft: -2 }} /> 
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {/* --- ALERT MODAL --- */}
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
                     // Since we use real data, find the note that matches userSeed
                     const myNote = notes.find(n => n.seed === userSeed);
                     if(myNote) { setActiveNote({...myNote, isMine: true}); setModalMode('view'); }
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