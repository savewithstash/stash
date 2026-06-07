// App.jsx — QVAC shell: capture console, orb states, gallery, ask thread, tweaks.
const { useState, useEffect, useRef, useCallback } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#38e0d4",
  "defaultView": "board",
  "texture": true
}/*EDITMODE-END*/;

const ACCENTS = [
  "#38e0d4", // plasma
  "#ff9d4d", // sodium
  "#ff5d73", // bloodmoon
  "#9d7dff", // ion violet
  "#cdd6e4", // mono
];

function pad(n){ return String(n).padStart(2,"0"); }
function clockStr(){ const d=new Date(); return pad(d.getHours())+":"+pad(d.getMinutes())+":"+pad(d.getSeconds()); }

function prettyLink(url){
  try{ const u=new URL(url); let s=u.hostname.replace(/^www\./,"")+u.pathname.replace(/\/$/,""); return s.length>52?s.slice(0,52)+"…":s; }
  catch(e){ return url.length>52?url.slice(0,52)+"…":url; }
}
function parseQuote(t){
  const m=t.match(/^["“'](.+)["”']\s*[—\-–]?\s*(.*)$/s) || t.match(/^(.*?)\s*[—\-–]\s*([A-Z][a-zA-Z.\s]{2,30})$/s);
  if(m){ const author=(m[2]||"").trim(); return { text:m[1].replace(/["“”']/g,"").trim(), author:author||null }; }
  return { text:t.replace(/["“”']/g,"").trim(), author:null };
}
function parseDue(t){
  const l=t.toLowerCase(); const D=86400000; const n=Date.now();
  if(/tonight/.test(l)) return n+0.4*D;
  if(/tomorrow/.test(l)) return n+1*D;
  if(/next week/.test(l)) return n+7*D;
  const days=l.match(/in (\d+) days?/); if(days) return n+parseInt(days[1])*D;
  return null;
}
function fileExtFromName(name){ const m=name.match(/\.(\w+)$/); return m?m[1]:"file"; }

function buildItem(raw, det){
  const base={ id:qid(), ts:Date.now(), type:det.type, tags:[] };
  switch(det.type){
    case "link": return { ...base, url:det.url, host:det.host, title:prettyLink(det.url) };
    case "video": return { ...base, url:det.url, host:det.host||"video", title:prettyLink(det.url) };
    case "image": {
      const name = det.url ? (det.url.split("/").pop().split("?")[0] || "capture.png") : "pasted_image.png";
      return { ...base, url:det.url||null, host:det.host, name, seed:(raw.length*7)%97 };
    }
    case "file": { const name=det.url?det.url.split("/").pop().split("?")[0]:raw.trim(); return { ...base, name, host:fileExtFromName(name) }; }
    case "code": return { ...base, lang:det.lang||"text", text:raw.replace(/^```\w*\n?/,"").replace(/```$/,"").trim() };
    case "quote": return { ...base, ...parseQuote(raw.trim()) };
    case "reminder": return { ...base, text:raw.trim().replace(/^remind me( to)?/i,"").trim()||raw.trim(), due:parseDue(raw) };
    default: return { ...base, text:raw.trim() };
  }
}

const DATE_ORDER=["TODAY","YESTERDAY","THIS WEEK","THIS MONTH","ARCHIVE"];

function App(){
  const [t,setTweak]=useTweaks(TWEAK_DEFAULTS);
  const [items,setItems]=useState([]);
  const [pendingImg,setPendingImg]=useState(null);
  const [vault,setVault]=useState({state:"loading",txt:"BOOTING",pct:0});
  const [nav,setNav]=useState("core");
  const [mode,setMode]=useState("store");
  const [text,setText]=useState("");
  const [orb,setOrb]=useState("idle");
  const [focus,setFocus]=useState(false);
  const [view,setView]=useState(TWEAK_DEFAULTS.defaultView);
  const [thread,setThread]=useState([]);
  const [chatId,setChatId]=useState(null);   // active server-side chat
  const [chatList,setChatList]=useState([]); // saved chat history
  const [search,setSearch]=useState("");
  const [searchFocus,setSearchFocus]=useState(false);
  const [toast,setToast]=useState(null);
  const [clock,setClock]=useState(clockStr());
  const taRef=useRef(null);
  const coreRef=useRef(null);
  const orbTimer=useRef(null);
  const toastTimer=useRef(null);

  useEffect(()=>{ document.documentElement.style.setProperty("--accent", t.accent); },[t.accent]);
  useEffect(()=>{ setView(t.defaultView); },[t.defaultView]);
  useEffect(()=>{ const fx=document.getElementById("bg-fx"); if(fx) fx.style.display=t.texture?"":"none"; },[t.texture]);
  useEffect(()=>{ const i=setInterval(()=>setClock(clockStr()),1000); return ()=>clearInterval(i); },[]);

  // initial vault load from the backend
  useEffect(()=>{ API.list().then(setItems).catch(()=>{}); },[]);
  // while an image card is still being captioned server-side (pending), keep
  // refreshing the list until enrichment lands
  useEffect(()=>{
    if(!items.some(i=>i.pending)) return;
    const t=setTimeout(()=>{ API.list().then(setItems).catch(()=>{}); }, 4000);
    return ()=>clearTimeout(t);
  },[items]);
  // live model status (text models + lazy vision model)
  useEffect(()=>{
    let stop=false;
    const tick=async()=>{
      try{
        const s=await API.status();
        const visionBusy=s.visionState==="loading";
        if(s.state==="error"||s.visionState==="error") setVault({state:"error",txt:"FAULT",pct:s.progress||0,msg:s.error||s.visionMessage||""});
        else if(s.state==="ready"&&!visionBusy) setVault({state:"ready",txt:"ONLINE",pct:100,msg:""});
        else if(visionBusy) setVault({state:"loading",txt:"VISION "+(s.visionMessage||"").replace(/[^0-9]/g,"")+"%",pct:s.progress||0,msg:s.visionMessage||""});
        else setVault({state:"loading",txt:"BOOTING "+(s.progress||0)+"%",pct:s.progress||0,msg:s.message||""});
        // keep polling forever — model switches from the settings tab flip the
        // status back to "loading" at any time (slow tick while ready)
        if(!stop) setTimeout(tick,(s.state!=="ready"||visionBusy)?1300:4000);
      }catch(e){ if(!stop) setTimeout(tick,2200); }
    };
    tick(); return ()=>{stop=true;};
  },[]);

  const detected = text.trim()? detectType(text):null;

  const autosize=()=>{ const ta=taRef.current; if(ta){ ta.style.height="auto"; ta.style.height=Math.min(ta.scrollHeight,200)+"px"; } };
  useEffect(autosize,[text]);

  const flashOrb=(state,ms,then="idle")=>{
    clearTimeout(orbTimer.current); setOrb(state);
    orbTimer.current=setTimeout(()=>setOrb(then),ms);
  };
  const showToast=(payload)=>{ clearTimeout(toastTimer.current); setToast(payload);
    toastTimer.current=setTimeout(()=>setToast(null),4200); };

  const scrollThread=()=>{ requestAnimationFrame(()=>{ if(coreRef.current) coreRef.current.scrollTop=coreRef.current.scrollHeight; }); };

  // store / ask, both backed by the real on-device QVAC endpoints
  const submit=async()=>{
    const raw=text.trim(); const img=pendingImg;
    if(!raw && !img) return;
    if(mode==="store"){
      setText(""); setPendingImg(null); flashOrb("thinking",120000);
      try{
        const { note }=await API.save({ text:raw, image:img });
        setItems(prev=>[note,...prev.filter(i=>i.id!==note.id)]);
        showToast({ type:note.type, id:note.id });
        flashOrb("speaking",900);
      }catch(e){
        showToast({ type:"note", id:"FAULT", err:e.message });
        clearTimeout(orbTimer.current); setOrb("idle");
      }
    } else {
      setThread(prev=>[...prev,{ role:"user", text:raw||"▣ image", img },{ role:"ai", pending:true }]);
      setText(""); setPendingImg(null); flashOrb("thinking",120000); scrollThread();
      try{
        const { answer, cited, chatId:cid }=await API.ask({ question:raw, image:img, chatId });
        if(cid) setChatId(cid);
        setThread(prev=>{ const n=[...prev]; n[n.length-1]={ role:"ai", lead:answer, cited, q:raw }; return n; });
        API.chats().then(setChatList).catch(()=>{});
        flashOrb("speaking",1500);
      }catch(e){
        setThread(prev=>{ const n=[...prev]; n[n.length-1]={ role:"ai", lead:"⚠ "+e.message, cited:[], q:raw }; return n; });
        clearTimeout(orbTimer.current); setOrb("idle");
      }
      scrollThread();
    }
  };

  // ---- chat history: load list in ask mode; open / delete / start fresh ---
  useEffect(()=>{ if(mode==="ask") API.chats().then(setChatList).catch(()=>{}); },[mode]);
  const openChat=async(c)=>{
    try{
      const chat=await API.chat(c.id);
      let lastQ="";
      setThread(chat.messages.map(m=> m.role==="user"
        ? (lastQ=m.text, { role:"user", text:m.text||"▣ image", img:m.image||null })
        : { role:"ai", lead:m.text, cited:m.cited||[], q:lastQ }));
      setChatId(chat.id); setMode("ask"); scrollThread();
    }catch(e){ /* chat may have been deleted */ }
  };
  const newChat=()=>{ setThread([]); setChatId(null); };
  const deleteChat=(id)=>{
    setChatList(prev=>prev.filter(c=>c.id!==id));
    if(id===chatId) newChat();
    API.delChat(id).catch(()=>{});
  };

  const onKey=(e)=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); submit(); } };
  const onFocus=()=>{ setFocus(true); if(orb==="idle") setOrb("listening"); };
  const onBlur=()=>{ setFocus(false); if(orb==="listening") setOrb("idle"); };
  const onImageFile=(file)=>{ if(!file)return; const r=new FileReader(); r.onload=()=>setPendingImg(r.result); r.readAsDataURL(file); };
  const clearImg=()=>setPendingImg(null);

  const deleteItem=(id)=>{ setItems(prev=>prev.filter(i=>i.id!==id)); API.del(id).catch(()=>{}); };

  const jumpTo=(item)=>{ setNav(item.type); };

  const counts={}; items.forEach(i=>{ counts[i.type]=(counts[i.type]||0)+1; });

  const goCore=(m)=>{ setNav("core"); setMode(m); setTimeout(()=>taRef.current&&taRef.current.focus(),60); };

  // gallery data
  const galleryItems = nav!=="core"
    ? items.filter(i=>i.type===nav).filter(i=>{
        if(!search.trim()) return true; const q=search.toLowerCase();
        return [i.text,i.title,i.author,i.note,i.name,i.host,(i.tags||[]).join(" ")].filter(Boolean).join(" ").toLowerCase().includes(q);
      })
    : [];
  const grouped={};
  galleryItems.forEach(i=>{ const g=dateGroup(i.ts); (grouped[g]=grouped[g]||[]).push(i); });

  const recent=items.slice(0,5);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="dot"></span>
          <span className="wordmark">STASH</span>
          <span className="tag">HOARD&nbsp;EVERYTHING&nbsp;·&nbsp;FIND&nbsp;ANYTHING</span>
        </div>
        <div className="topstat">
          <span><b>{items.length}</b> ENTRIES</span>
          <span>VAULT&nbsp;<b style={{color:"var(--accent-ink)"}}>{vault.txt}</b></span>
          <span className="clock">{clock}</span>
        </div>
      </header>

      <div className="body">
        <nav className="rail">
          <button className={"rail-btn"+(nav==="core"&&mode==="store"?" active":"")} onClick={()=>goCore("store")}>
            <Icon name="core" size={22}/><span className="rail-tip">Core · Capture</span>
          </button>
          <div className="rail-sep"></div>
          {CATEGORIES.map(c=>(
            <button key={c.id} className={"rail-btn"+(nav===c.id?" active":"")} onClick={()=>{setNav(c.id);setSearch("");}}>
              <Icon name={c.glyph} size={20}/>
              {counts[c.id]?<span className="count">{counts[c.id]}</span>:null}
              <span className="rail-tip">{c.label}</span>
            </button>
          ))}
          <div className="rail-spacer"></div>
          <div className="rail-sep"></div>
          <button className={"rail-btn"+(nav==="core"&&mode==="ask"?" active":"")} onClick={()=>goCore("ask")}>
            <Icon name="ask" size={21}/><span className="rail-tip">Ask the Core</span>
          </button>
          <button className={"rail-btn"+(nav==="settings"?" active":"")} onClick={()=>{setNav("settings");setSearch("");}}>
            <Icon name="settings" size={21}/><span className="rail-tip">Settings</span>
          </button>
        </nav>

        <main className="main">
          {nav==="core"
            ? <CoreView {...{mode,setMode,orb,focus,onFocus,onBlur,onKey,text,setText,detected,submit,taRef,coreRef,thread,recent,deleteItem,jumpTo,pendingImg,onImageFile,clearImg,chatList,openChat,newChat,deleteChat}}/>
            : nav==="settings"
            ? <SettingsView vault={vault}/>
            : <GalleryView {...{nav,counts,view,setView,search,setSearch,searchFocus,setSearchFocus,grouped,deleteItem,goCore,galleryItems}}/>}
        </main>
      </div>

      {toast&&(
        <div className="toast">
          <span className="t-icon"><Icon name={CAT[toast.type].glyph} size={16}/></span>
          <span className="t-main">
            <b>Stored in {CAT[toast.type].label}</b>
            <span>{toast.id} · auto-classified</span>
          </span>
          <button className="t-go" onClick={()=>{ setNav(toast.type); setToast(null); }}>VIEW</button>
        </div>
      )}

      <TweaksPanel>
        <TweakSection label="Core"/>
        <TweakColor label="Accent signal" value={t.accent} options={ACCENTS} onChange={v=>setTweak("accent",v)}/>
        <TweakToggle label="Ambient texture" value={t.texture} onChange={v=>setTweak("texture",v)}/>
        <TweakSection label="Gallery"/>
        <TweakRadio label="Default layout" value={t.defaultView} options={["board","list"]} onChange={v=>setTweak("defaultView",v)}/>
      </TweaksPanel>
    </div>
  );
}

function CoreView({mode,setMode,orb,focus,onFocus,onBlur,onKey,text,setText,detected,submit,taRef,coreRef,thread,recent,deleteItem,jumpTo,pendingImg,onImageFile,clearImg,chatList,openChat,newChat,deleteChat}){
  const fileRef=useRef(null);
  const chip = detected || (mode==="store"&&pendingImg?{type:"image"}:null);
  const hasThread = mode==="ask" && thread.length>0;
  const orbSize = hasThread?120:210;
  return (
    <div className={"core"+(hasThread?" has-thread":"")} ref={coreRef}>
      <div className="orb-wrap" style={{marginBottom:hasThread?4:0}}>
        <Orb state={orb} size={orbSize}/>
        {!hasThread&&(
          <div className="core-prompt">
            {mode==="store"
              ? <React.Fragment><h1>Transmit anything. The core will <em>classify it</em>.</h1><p>Paste a link, image, note, quote, code, reminder — it's typed and filed on arrival.</p></React.Fragment>
              : <React.Fragment><h1>Ask the core <em>what you know</em>.</h1><p>Query your vault in plain language. Answers are pulled from what you've saved.</p></React.Fragment>}
          </div>
        )}
      </div>

      <div className="console">
        <div className="mode-toggle">
          <button className={mode==="store"?"on":""} onClick={()=>setMode("store")}><Icon name="spark" size={14}/> Store</button>
          <button className={mode==="ask"?"on":""} onClick={()=>setMode("ask")}><Icon name="ask" size={14}/> Ask</button>
          {mode==="ask"&&thread.length>0&&<button className="newchat" onClick={newChat} title="Start a new chat">✚ New</button>}
        </div>

        {mode==="ask"&&thread.length>0&&(
          <div className="thread">
            {thread.map((m,i)=> m.role==="user"
              ? <div key={i} className="msg-user">{m.img&&<img className="msg-img" src={m.img} alt="attachment"/>}{m.text}</div>
              : <div key={i} className="msg-ai">
                  <span className="ai-orb"><Orb state={m.pending?"thinking":"speaking"} size={34}/></span>
                  <div className="ai-body">
                    {m.pending
                      ? <div className="thinking"><span></span><span></span><span></span></div>
                      : <AiAnswer m={m} jumpTo={jumpTo}/>}
                  </div>
                </div>
            )}
          </div>
        )}

        <div className={"input-shell"+(focus?" focus":"")}>
          {pendingImg&&(
            <span className="attach-preview">
              <img src={pendingImg} alt="attachment"/>
              <button className="attach-x" title="remove" onClick={clearImg}>✕</button>
            </span>
          )}
          <textarea ref={taRef} rows={1} value={text}
            placeholder={mode==="store"?"Drop a link, note, quote, code, reminder…":"Ask the core anything — “what did I save about memory?”"}
            onChange={e=>setText(e.target.value)} onFocus={onFocus} onBlur={onBlur} onKeyDown={onKey}
            onPaste={e=>{ const it=[...(e.clipboardData?.items||[])].find(x=>x.type.startsWith("image/")); if(it){ e.preventDefault(); onImageFile(it.getAsFile()); } }}/>
          {mode==="store"&&chip&&(
            <span className="detect-chip"><Icon name={CAT[chip.type].glyph} size={12}/> {CAT[chip.type].label.replace(/s$/,"").toUpperCase()}{chip.lang?" · "+chip.lang.toUpperCase():""}</span>
          )}
          <input type="file" accept="image/*" ref={fileRef} style={{display:"none"}} onChange={e=>{ onImageFile(e.target.files[0]); e.target.value=""; }}/>
          <button className="attach-btn" title="attach image" onClick={()=>fileRef.current&&fileRef.current.click()}>
            <Icon name="image" size={17}/>
          </button>
          <button className="send-btn" disabled={!text.trim()&&!pendingImg} onClick={submit}>
            <Icon name={mode==="store"?"send":"ask"} size={18}/>
          </button>
        </div>
        <div className="console-hint">
          <span><kbd>↵</kbd> {mode==="store"?"store":"ask"}</span>
          <span><kbd>⇧ ↵</kbd> new line</span>
          <span>{mode==="store"?"auto-detects type":"grounded in your vault"}</span>
        </div>
      </div>

      {mode==="store"&&(
        <div className="recent">
          <div className="recent-h">RECENT CAPTURES</div>
          <div className="recent-list">
            {recent.map(it=><ItemCard key={it.id} item={it} onDelete={deleteItem}/>)}
          </div>
        </div>
      )}

      {mode==="ask"&&thread.length===0&&chatList.length>0&&(
        <div className="recent">
          <div className="recent-h">CHAT HISTORY</div>
          <div className="chat-list">
            {chatList.map(c=>(
              <button key={c.id} className="chat-row" onClick={()=>openChat(c)}>
                <Icon name="ask" size={14}/>
                <span className="chat-title">{c.title}</span>
                <span className="chat-meta mono dim">{c.questions} Q · {relTime(Date.parse(c.updatedAt))}</span>
                <span className="card-del" title="Delete chat" onClick={(e)=>{e.stopPropagation();deleteChat(c.id);}}><Icon name="trash" size={13}/></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// AI answer body: the lead text (with [n] citations turned into jump buttons),
// then rich previews of the notes the answer actually cites, then the rest of
// the retrieved notes as the compact "also considered" list.
function AiAnswer({m,jumpTo}){
  const cited=m.cited||[];
  // citation numbers in order of first appearance in the answer
  const seen=new Set();
  const nums=[];
  for(const match of (m.lead||"").matchAll(/\[(\d+)\]/g)){
    const n=parseInt(match[1],10);
    if(n>=1&&n<=cited.length&&!seen.has(n)){ seen.add(n); nums.push(n); }
  }
  const featured=nums.map(n=>({n,item:cited[n-1]}));
  const featIds=new Set(featured.map(f=>f.item.id));
  const others=cited.filter(c=>!featIds.has(c.id));
  return (
    <React.Fragment>
      <div className="ai-lead">{renderLead(m,jumpTo)}</div>
      {featured.length>0&&(
        <div className="preview-list">{featured.map(f=><PreviewCard key={f.item.id} n={f.n} item={f.item} onJump={jumpTo}/>)}</div>
      )}
      {others.length>0&&(
        <React.Fragment>
          {featured.length>0&&<div className="cited-label mono">ALSO CONSIDERED</div>}
          <div className="cited-list">{others.map(c=><CitedCard key={c.id} item={c} onJump={jumpTo}/>)}</div>
        </React.Fragment>
      )}
    </React.Fragment>
  );
}

// Turn [n] citation markers in a text fragment into clickable jump buttons.
function linkifyCites(text,m,jumpTo,keyBase){
  const cited=m.cited||[];
  const out=[];
  let last=0;
  for(const match of text.matchAll(/\[(\d+)\]/g)){
    const n=parseInt(match[1],10);
    const item=n>=1&&n<=cited.length?cited[n-1]:null;
    out.push(text.slice(last,match.index));
    out.push(item
      ? <button key={keyBase+match.index} className="cite-ref mono" title="Show note" onClick={()=>jumpTo(item)}>{n}</button>
      : match[0]);
    last=match.index+match[0].length;
  }
  out.push(text.slice(last));
  return out;
}

function renderLead(m,jumpTo){
  if(!m.q) return m.lead;
  const parts=m.lead.split("“"+m.q.trim()+"”");
  if(parts.length===2) return <React.Fragment>{linkifyCites(parts[0],m,jumpTo,"a")}“<span className="q">{m.q.trim()}</span>”{linkifyCites(parts[1],m,jumpTo,"b")}</React.Fragment>;
  return <React.Fragment>{linkifyCites(m.lead,m,jumpTo,"a")}</React.Fragment>;
}

function GalleryView({nav,counts,view,setView,search,setSearch,searchFocus,setSearchFocus,grouped,deleteItem,goCore,galleryItems}){
  const cat=CAT[nav];
  return (
    <div className="gallery-view">
      <header className="gal-head">
        <div className="gal-title">
          <span className="gt-icon"><Icon name={cat.glyph} size={20}/></span>
          <div>
            <h2>{cat.label}</h2>
            <div className="gt-count">{galleryItems.length} {galleryItems.length===1?"ENTRY":"ENTRIES"}{search?" · FILTERED":""}</div>
          </div>
        </div>
        <div className="gal-tools">
          <div className={"search-box"+(searchFocus?" focus":"")}>
            <Icon name="search" size={15}/>
            <input value={search} placeholder="filter…" onChange={e=>setSearch(e.target.value)}
              onFocus={()=>setSearchFocus(true)} onBlur={()=>setSearchFocus(false)}/>
          </div>
          <div className="view-toggle">
            <button className={view==="board"?"on":""} onClick={()=>setView("board")} title="Board"><Icon name="grid" size={16}/></button>
            <button className={view==="list"?"on":""} onClick={()=>setView("list")} title="List"><Icon name="list" size={16}/></button>
          </div>
        </div>
      </header>

      <div className="gal-scroll">
        {galleryItems.length===0
          ? <div className="empty"><Icon name={cat.glyph} size={40}/><p>NO {cat.label.toUpperCase()} {search?"MATCH FILTER":"YET"}</p></div>
          : DATE_ORDER.filter(g=>grouped[g]).map(g=>(
              <div key={g} className="date-group">
                <div className="date-label">{g}</div>
                {view==="board"
                  ? <div className="board">{grouped[g].map(it=><ItemCard key={it.id} item={it} onDelete={deleteItem}/>)}</div>
                  : <div className="list">{grouped[g].map(it=><ItemRow key={it.id} item={it} onDelete={deleteItem}/>)}</div>}
              </div>
            ))}
      </div>

      <button className="fab" onClick={()=>goCore("store")}>
        <span className="fab-orb"><Orb state="idle" size={30}/></span>
        Capture
      </button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
