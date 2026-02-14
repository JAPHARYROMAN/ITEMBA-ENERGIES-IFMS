
import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
// Fix: Correctly importing useLocation and Link from react-router-dom
import { useLocation, Link } from 'react-router-dom';

const Breadcrumbs: React.FC = () => {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter((x) => x);

  return (
    <nav className="flex items-center space-x-2 text-xs font-medium text-muted-foreground">
      <Link to="/app" className="hover:text-foreground flex items-center">
        <Home size={14} className="mr-1" />
        IFMS
      </Link>
      {pathnames.map((name, index) => {
        const routeTo = `/${pathnames.slice(0, index + 1).join('/')}`;
        const isLast = index === pathnames.length - 1;

        return (
          <React.Fragment key={name}>
            <ChevronRight size={12} className="text-muted-foreground/50" />
            <Link
              to={routeTo}
              className={`capitalize hover:text-foreground ${
                isLast ? 'text-foreground font-bold pointer-events-none' : ''
              }`}
            >
              {name.replace(/-/g, ' ')}
            </Link>
          </React.Fragment>
        );
      })}
    </nav>
  );
};

export default Breadcrumbs;
