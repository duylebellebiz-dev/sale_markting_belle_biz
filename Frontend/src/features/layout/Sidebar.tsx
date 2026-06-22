import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getNavItems } from './navItems';
import NavIcon from './NavIcon';
import NotificationBell from '../notifications/NotificationBell';

export default function Sidebar() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const items = getNavItems(user.role, user.permissions);

  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 bg-gray-900 text-gray-100 min-h-screen">
      {/* Brand + bell */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-gray-700">
        <div>
          <span className="text-lg font-bold tracking-tight text-white">SaleSupport</span>
          <p className="text-xs text-gray-400 mt-0.5 capitalize">{user.role}</p>
        </div>
        {/* Bell sits outside nav links so dropdown isn't clipped by overflow-y-auto */}
        <div className="text-gray-300">
          <NotificationBell />
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-0.5 px-2">
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white',
              ].join(' ')
            }
          >
            <NavIcon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User info + sign out */}
      <div className="border-t border-gray-700 px-4 py-4">
        <p className="text-sm font-medium text-white truncate">{user.fullName || user.email}</p>
        <p className="text-xs text-gray-400 truncate mb-3">{user.email}</p>
        <button
          onClick={logout}
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
        >
          <NavIcon name="log-out" className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
