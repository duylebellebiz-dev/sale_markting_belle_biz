import NavIcon from './NavIcon';
import NotificationBell from '../notifications/NotificationBell';

interface Props {
  onMenuClick: () => void;
  title?: string;
}

export default function Topbar({ onMenuClick, title }: Props) {
  return (
    <header className="md:hidden flex items-center justify-between h-14 px-4 bg-white border-b border-gray-200 sticky top-0 z-10">
      <button
        onClick={onMenuClick}
        className="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100"
        aria-label="Open navigation"
      >
        <NavIcon name="menu" className="w-6 h-6" />
      </button>
      <span className="text-base font-semibold text-gray-800">
        {title ?? 'SaleSupport'}
      </span>
      <NotificationBell />
    </header>
  );
}
