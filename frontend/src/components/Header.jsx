// Top bar: app name, search box (display-only for now), and page links.

function Header({ current, onDashboard, onShowHistory, onShowSummary, onShowHidden }) {
  return (
    <header className="header">
      <button type="button" className="header__brand header__brand-btn" onClick={onDashboard}>
        💰 See My Money
      </button>
      <div className="header__right">
        <input
          className="header__search"
          type="search"
          placeholder="Search transactions… (coming soon)"
          aria-label="Search transactions"
        />
        <button
          type="button"
          className="header__hidden-btn"
          aria-current={current === 'history' ? 'page' : undefined}
          onClick={onShowHistory}
        >
          🧾 History
        </button>
        <button
          type="button"
          className="header__hidden-btn"
          aria-current={current === 'summary' ? 'page' : undefined}
          onClick={onShowSummary}
        >
          📊 Summary
        </button>
        <button
          type="button"
          className="header__hidden-btn"
          aria-current={current === 'hidden' ? 'page' : undefined}
          onClick={onShowHidden}
        >
          🙈 Hidden
        </button>
      </div>
    </header>
  )
}

export default Header
