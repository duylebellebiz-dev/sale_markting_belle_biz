import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getNavItems } from './navItems';
import NavIcon from './NavIcon';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function MobileDrawer({ open, onClose }: Props) {
  const { user, logout } = useAuth();
  if (!user) return null;
  const items = getNavItems(user.role, user.permissions);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer panel */}
      <div
        className={[
          'fixed inset-y-0 left-0 z-30 w-64 bg-gray-900 text-gray-100 flex flex-col',
          'transition-transform duration-200 ease-in-out md:hidden',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-gray-700">
          <div>
            <span className="text-lg font-bold text-white">SaleSupport</span>
            <p className="text-xs text-gray-400 capitalize">{user.role}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <NavIcon name="x" className="w-5 h-5" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto py-4 space-y-0.5 px-2">
          {items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
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

        {/* User footer */}
        <div className="border-t border-gray-700 px-4 py-4">
          <p className="text-sm font-medium text-white truncate">{user.fullName || user.email}</p>
          <p className="text-xs text-gray-400 truncate mb-3">{user.email}</p>
          <button
            onClick={() => { onClose(); logout(); }}
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
          >
            <NavIcon name="log-out" className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}
