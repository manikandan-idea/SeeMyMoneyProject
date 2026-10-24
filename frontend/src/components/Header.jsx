// Top bar: app name, search box (display-only for now), Hidden folders link.

function Header({ onShowHidden }) {
  return (
    <header className="header">
      <div className="header__brand">💰 See My Money</div>
      <div className="header__right">
        <input
          className="header__search"
          type="search"
          placeholder="Search transactions… (coming soon)"
        />
        <button type="button" className="header__hidden-btn" onClick={onShowHidden}>
          🙈 Hidden
        </button>
      </div>
    </header>
  )
}

export default Header
