import { PageType, MENU_ITEMS } from '../types';

interface Props {
  isOpen: boolean;
  currentPage: PageType;
  onMenuClick: (pageId: PageType) => void;
  onClose: () => void;
  onLogout: () => void;
}

export default function AdminSidebar({ isOpen, currentPage, onMenuClick, onClose, onLogout }: Props) {
  return (
    <>
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold text-gray-800">メニュー</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <nav className="space-y-2">
            {MENU_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => onMenuClick(item.id)}
                className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                  currentPage === item.id
                    ? 'bg-[#D4B946] text-white font-bold'
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <button
              onClick={onLogout}
              className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 text-gray-700 flex items-center gap-3"
            >
              <span className="text-xl">🚪</span>
              <span>ログアウト</span>
            </button>
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose} />
      )}
    </>
  );
}
