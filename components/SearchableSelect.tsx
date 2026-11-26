import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search } from 'lucide-react';

export interface SearchableOption {
  value: string;
  label: string;
  filterText: string;
}

interface SearchableSelectProps {
  label?: string;
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({ label, options, value, onChange, placeholder = "Selecione...", className = "" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt => opt.filterText.toLowerCase().includes(searchTerm.toLowerCase()));

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className={`space-y-1 relative ${className}`} ref={dropdownRef}>
      {label && <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</label>}
      <button
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className={`group w-full flex items-center justify-between p-2.5 border rounded-xl shadow-sm backdrop-blur-sm focus:ring-2 focus:ring-primary outline-none text-left bg-white/80 dark:bg-gray-800/70 transition-all duration-200 cursor-pointer ${
          isOpen
            ? 'border-primary dark:border-sky-400 ring-2 ring-primary/20 dark:ring-sky-400/20 shadow-md'
            : 'border-gray-200/80 dark:border-gray-700/70 hover:border-primary/60 dark:hover:border-sky-400/60 hover:shadow-md hover:bg-white dark:hover:bg-gray-800'
        }`}
      >
        <span className="truncate flex-1 pr-2 text-gray-700 dark:text-gray-200 font-medium group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary dark:text-sky-400' : 'text-gray-400 group-hover:text-primary dark:group-hover:text-sky-400'}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl border border-gray-200/80 dark:border-gray-700/70 rounded-xl shadow-2xl overflow-hidden animate-fade-in">
          <div className="p-2 border-b border-gray-100/70 dark:border-gray-700/60 relative bg-gray-50/70 dark:bg-gray-900/40">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200/70 dark:border-gray-700/70 bg-white dark:bg-gray-900 rounded-lg shadow-inner focus:outline-none focus:ring-2 focus:ring-primary text-gray-700 dark:text-gray-200 transition-all"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1 space-y-0.5">
            <button
              type="button"
              className={`w-full text-left px-3 py-2 text-sm rounded-lg cursor-pointer transition-all duration-150 ${value === '' ? 'bg-primary text-white shadow-sm' : 'text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-gray-700/80 hover:pl-4 hover:text-primary dark:hover:text-sky-300'}`}
              onClick={() => {
                onChange('');
                setIsOpen(false);
                setSearchTerm('');
              }}
            >
              -- Nenhum --
            </button>
            {filteredOptions.length === 0 ? (
              <div className="px-2 py-2 text-sm text-gray-500 text-center">Nenhum resultado</div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={`w-full text-left px-3 py-2 text-sm rounded-lg cursor-pointer truncate transition-all duration-150 ${value === option.value ? 'bg-primary/15 text-primary dark:bg-sky-500/20 dark:text-sky-300 font-semibold' : 'text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-gray-700/80 hover:pl-4 hover:text-primary dark:hover:text-sky-300'}`}
                  title={option.label}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                >
                  {option.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
