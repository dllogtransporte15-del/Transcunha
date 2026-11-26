import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';

interface MultiSelectDropdownProps {
  label?: string;
  options: string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
  icon?: React.ElementType;
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({ 
  label, 
  options, 
  selectedValues, 
  onChange, 
  placeholder = "Selecione...", 
  className = "",
  icon: Icon
}) => {
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

  const filteredOptions = options.filter(opt => opt.toLowerCase().includes(searchTerm.toLowerCase()));

  const toggleOption = (option: string) => {
    if (selectedValues.includes(option)) {
      onChange(selectedValues.filter(v => v !== option));
    } else {
      onChange([...selectedValues, option]);
    }
  };

  const isAllSelected = selectedValues.length === options.length && options.length > 0;

  const toggleAll = () => {
    if (isAllSelected) {
      onChange([]);
    } else {
      onChange([...options]);
    }
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const hasSelection = selectedValues.length > 0;

  return (
    <div className={`space-y-1 relative ${className}`} ref={dropdownRef}>
      {label && (
        <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 block px-0.5">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {Icon && (
          <Icon className={`w-3.5 h-3.5 absolute left-2.5 pointer-events-none transition-colors ${
            hasSelection ? 'text-blue-600 dark:text-blue-400' : 'text-blue-500'
          }`} />
        )}
        <button
          type="button"
          role="combobox"
          aria-expanded={isOpen}
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between py-1 text-xs font-semibold rounded-lg border transition-all duration-200 shadow-sm outline-none text-left cursor-pointer ${
            Icon ? 'pl-8' : 'pl-3'
          } ${hasSelection ? 'pr-8 bg-blue-100/80 text-blue-900 border-blue-300 hover:border-blue-500 hover:shadow-md dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700 dark:hover:border-sky-400' : 'bg-blue-50/40 dark:bg-blue-900/20 text-gray-900 dark:text-white border-blue-200 dark:border-blue-800/60 hover:bg-blue-50/90 dark:hover:bg-blue-900/35 hover:border-primary/60 dark:hover:border-sky-400/60 hover:shadow-md'}`}
        >
          <span className="truncate flex-1 pr-1">
            {selectedValues.length === 0 ? placeholder :
             selectedValues.length === 1 ? selectedValues[0] :
             `${selectedValues.length} selecionados`}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} ${
            hasSelection ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'
          }`} />
        </button>
        {hasSelection && (
          <button
            type="button"
            onClick={clearAll}
            className="absolute right-6 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors p-0.5"
            title="Limpar seleção"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full min-w-[200px] mt-1 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800/80 rounded-xl shadow-xl overflow-hidden animate-fade-in">
          <div className="p-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/40">
            <input
              type="text"
              className="w-full px-2.5 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="max-h-48 overflow-y-auto p-1 space-y-0.5">
            {!searchTerm && options.length > 0 && (
              <label className="flex items-center px-2 py-1.5 hover:bg-blue-50/60 dark:hover:bg-gray-700/60 rounded-md cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  className="mr-2 rounded text-primary focus:ring-primary h-3.5 w-3.5 accent-primary flex-shrink-0"
                  checked={isAllSelected}
                  onChange={toggleAll}
                />
                <span className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">Selecionar Todos</span>
              </label>
            )}
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 text-center font-medium">Nenhum resultado</div>
            ) : (
              filteredOptions.map((option) => (
                <label key={option} className="flex items-center px-2 py-1.5 hover:bg-blue-50/60 dark:hover:bg-gray-700/60 rounded-md cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    className="mr-2 rounded text-primary focus:ring-primary h-3.5 w-3.5 accent-primary flex-shrink-0"
                    checked={selectedValues.includes(option)}
                    onChange={() => toggleOption(option)}
                  />
                  <span className="text-xs text-gray-800 dark:text-gray-200 truncate" title={option}>{option}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiSelectDropdown;

