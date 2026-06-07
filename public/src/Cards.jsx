// Cards.jsx — per-type item rendering for gallery (card) + list (row) views,
// plus the compact "cited" card used in Ask answers.

function TypeBadge({ type }) {
  const c = CAT[type];
  return (
    <span className="badge" data-type={type}>
      <Icon name={c.glyph} size={12} stroke={1.8} />
      <span>{c.label.replace(/s$/, "")}</span>
    </span>
  );
}

function ImageThumb({ item, h = 150 }) {
  if (item.img) {
    return (
      <div className="img-thumb real" style={{ height: h }} onClick={() => window.open(item.img, "_blank")}>
        <img src={item.img} alt={item.name || "image"} />
        <div className="img-scan"></div>
      </div>
    );
  }
  return (
    <div className="img-thumb" style={{ background: imgGradient(item.seed || 1), height: h }}>
      <div className="img-scan"></div>
      <Icon name="image" size={22} />
    </div>
  );
}

function CardInner({ item }) {
  const it = item;
  switch (it.type) {
    case "link":
      return (
        <React.Fragment>
          {it.thumb
            ? <div className="link-thumb"><img src={it.thumb} alt="" loading="lazy" /><div className="img-scan"></div></div>
            : <div className="card-favi"><span>{(it.host || "?")[0].toUpperCase()}</span></div>}
          <div className="card-title">{it.title}</div>
          {it.note && <div className="card-note">{it.note}</div>}
          <div className="card-host"><Icon name="external" size={11} /> {it.siteName || it.host}</div>
        </React.Fragment>
      );
    case "image":
      return (
        <React.Fragment>
          <ImageThumb item={it} />
          <div className="card-sub mono">{it.name}</div>
          {it.note && <div className="card-note">{it.note}</div>}
        </React.Fragment>
      );
    case "video":
      return (
        <React.Fragment>
          <div className="img-thumb vid" style={{ background: it.thumb ? "none" : imgGradient((it.title || "v").length * 5), height: 130 }}>
            {it.thumb && <img className="vid-thumb-img" src={it.thumb} alt="" loading="lazy" />}
            <div className="img-scan"></div>
            <div className="play-btn"><Icon name="play" size={20} /></div>
            {it.dur && <span className="vid-dur mono">{it.dur}</span>}
          </div>
          <div className="card-title sm">{it.title}</div>
          <div className="card-host"><Icon name="video" size={11} /> {it.siteName || it.host}</div>
        </React.Fragment>
      );
    case "note":
      return <div className="card-body">{it.text}</div>;
    case "quote":
      return (
        <React.Fragment>
          <div className="quote-mark">“</div>
          <div className="card-quote">{it.text}</div>
          {it.author && <div className="card-author">— {it.author}</div>}
        </React.Fragment>
      );
    case "code":
      return (
        <React.Fragment>
          <div className="code-head mono"><span className="code-dot"></span><span className="code-dot"></span><span className="code-dot"></span><span className="code-lang">{it.lang}</span></div>
          <pre className="code-block mono">{it.text}</pre>
        </React.Fragment>
      );
    case "reminder": {
      const due = it.due ? dueLabel(it.due) : null;
      return (
        <React.Fragment>
          {due && <div className={"due-chip mono due-" + due.state}>{due.txt}</div>}
          <div className="card-body rem">{it.text}</div>
        </React.Fragment>
      );
    }
    case "file":
      return (
        <React.Fragment>
          <div className="file-ext mono">{(it.host || "file").toUpperCase()}</div>
          <div className="card-title sm">{it.name}</div>
          {it.size && <div className="card-sub mono">{it.size}</div>}
        </React.Fragment>
      );
    default:
      return <div className="card-body">{it.text}</div>;
  }
}

function ItemCard({ item, onDelete }) {
  // link & video cards open their URL on click (delete stops propagation)
  const openable = (item.type === "link" || item.type === "video") && item.url;
  return (
    <article className={"item-card type-" + item.type + (openable ? " openable" : "")} tabIndex={0}
             title={openable ? item.url : undefined}
             onClick={openable ? () => window.open(item.url, "_blank") : undefined}>
      <header className="card-head">
        <TypeBadge type={item.type} />
        <div className="card-meta">
          <span className="mono dim">{relTime(item.ts)}</span>
          <button className="card-del" title="Release" onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}><Icon name="trash" size={13} /></button>
        </div>
      </header>
      <div className="card-content"><CardInner item={item} /></div>
      <footer className="card-foot mono">
        <span className="qv-id">{item.id}</span>
        {item.tags && item.tags.length > 0 && (
          <span className="tag-row">{item.tags.map(t => <span key={t} className="tag">#{t}</span>)}</span>
        )}
      </footer>
    </article>
  );
}

function ItemRow({ item, onDelete }) {
  const it = item;
  const summary =
    it.type === "link" ? it.title :
    it.type === "image" ? it.name :
    it.type === "video" ? it.title :
    it.type === "quote" ? `“${it.text}”` :
    it.type === "code" ? it.text.split("\n")[0] + " …" :
    it.type === "file" ? it.name :
    it.text;
  const openable = (it.type === "link" || it.type === "video") && it.url;
  return (
    <div className={"item-row type-" + it.type + (openable ? " openable" : "")} tabIndex={0}
         title={openable ? it.url : undefined}
         onClick={openable ? () => window.open(it.url, "_blank") : undefined}>
      <span className="row-icon" data-type={it.type}><Icon name={CAT[it.type].glyph} size={15} /></span>
      <span className="row-summary">{summary}</span>
      <span className="row-host mono dim">{it.host || it.author || (it.tags && it.tags[0] ? "#" + it.tags[0] : "")}</span>
      <span className="row-id mono dim">{it.id}</span>
      <span className="row-time mono dim">{relTime(it.ts)}</span>
      <button className="card-del" title="Release" onClick={(e) => { e.stopPropagation(); onDelete(it.id); }}><Icon name="trash" size={13} /></button>
    </div>
  );
}

// Rich preview of a note the AI actually cited in its answer — shown inline
// in the Ask thread above the smaller "also considered" list.
function PreviewCard({ item, n, onJump }) {
  return (
    <article className={"item-card preview-card type-" + item.type} tabIndex={0}
             title="Open in vault" onClick={() => onJump(item)}>
      <header className="card-head">
        <TypeBadge type={item.type} />
        <div className="card-meta">
          <span className="cite-num mono">[{n}]</span>
          <span className="mono dim">{relTime(item.ts)}</span>
        </div>
      </header>
      <div className="card-content"><CardInner item={item} /></div>
    </article>
  );
}

function CitedCard({ item, onJump }) {
  const it = item;
  const summary =
    it.type === "link" ? it.title :
    it.type === "image" ? it.name :
    it.type === "video" ? it.title :
    it.type === "quote" ? `“${it.text.slice(0, 80)}${it.text.length > 80 ? "…" : ""}”` :
    it.type === "file" ? it.name :
    (it.text || "").slice(0, 90) + ((it.text || "").length > 90 ? "…" : "");
  return (
    <button className="cited" onClick={() => onJump(it)}>
      <span className="cited-icon" data-type={it.type}><Icon name={CAT[it.type].glyph} size={14} /></span>
      <span className="cited-main">
        <span className="cited-summary">{summary}</span>
        <span className="cited-meta mono">{CAT[it.type].label.replace(/s$/, "")} · {it.id} · {relTime(it.ts)}</span>
      </span>
      <span className="cited-go"><Icon name="external" size={13} /></span>
    </button>
  );
}

Object.assign(window, { TypeBadge, ItemCard, ItemRow, CitedCard, PreviewCard, ImageThumb });
