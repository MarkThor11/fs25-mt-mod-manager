import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';

const CategoryItem = ({ category, activeFilter, onSelect, depth }) => {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = category.children && category.children.length > 0;
  const isActive = category.filter && category.filter === activeFilter;

  const handleClick = (e) => {
    e.stopPropagation();
    if (hasChildren) setExpanded(!expanded);
    if (category.filter) {
      if (category.filter !== activeFilter) onSelect(category.filter);
    } else if (hasChildren) {
      const aggregateKey = `aggregate:${category.label}`;
      if (aggregateKey !== activeFilter) onSelect(aggregateKey);
    }
  };

  return (
    <div className="cat-tree__node">
      <div
        className={`cat-tree__item ${isActive ? 'cat-tree__item--active' : ''}`}
        onClick={handleClick}
        style={{ paddingLeft: `${12 + depth * 12}px` }}
      >
        {hasChildren ? (
          <ChevronRight
            size={14}
            className={`cat-tree__toggle ${expanded ? 'cat-tree__toggle--open' : ''}`}
          />
        ) : (
          <div style={{ width: 14 }} />
        )}
        <span>{category.label}</span>
      </div>

      {hasChildren && expanded && (
        <div className="cat-tree__children">
          {category.children.map((child, idx) => (
            <CategoryItem
              key={`${child.label}-${idx}`}
              category={child}
              activeFilter={activeFilter}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default function CategoryTree({ categories, activeFilter, onSelect }) {
  return (
    <div className="cat-tree">
      <div className="cat-tree__section-label">Categories</div>
      {(categories || []).map((cat, idx) => (
        <CategoryItem
          key={`cat-${cat.label}-${cat.filter || idx}`}
          category={cat}
          activeFilter={activeFilter}
          onSelect={onSelect}
          depth={0}
        />
      ))}
    </div>
  );
}
