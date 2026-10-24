// Clickable breadcrumb trail: Income › Business › Projects
// Clicking any crumb jumps back to that level.

function Breadcrumb({ crumbs, onNavigate }) {
  return (
    <nav className="breadcrumb" aria-label="Folder path">
      {crumbs.map((crumb, index) => (
        <span key={crumb.id ?? 'root'} className="breadcrumb__crumb">
          {index > 0 && <span className="breadcrumb__sep">›</span>}
          <button
            type="button"
            onClick={() => onNavigate(index)}
            disabled={index === crumbs.length - 1}
          >
            {crumb.name}
          </button>
        </span>
      ))}
    </nav>
  )
}

export default Breadcrumb
