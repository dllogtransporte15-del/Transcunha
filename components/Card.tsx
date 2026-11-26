
import React from 'react';

interface CardProps {
  title: string;
  value: string;
  icon: React.ReactElement;
  colorClass: string;
}

const Card: React.FC<CardProps> = ({ title, value, icon, colorClass }) => {
  return (
    <div className="interactive-spotlight group bg-white dark:bg-gray-800/95 rounded-2xl border border-slate-200/80 dark:border-slate-700/70 shadow-md hover:shadow-xl hover:shadow-blue-900/10 dark:hover:shadow-sky-950/40 hover:border-primary/40 dark:hover:border-sky-500/40 hover:-translate-y-1 p-6 flex items-center transition-all duration-300">
      <div className={`p-3.5 rounded-2xl ${colorClass} transition-transform duration-300 group-hover:scale-110 group-hover:shadow-md`}>
        {icon}
      </div>
      <div className="ml-4 min-w-0">
        <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 group-hover:text-primary dark:group-hover:text-sky-400 transition-colors">{title}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">{value}</p>
      </div>
    </div>
  );
};

export default Card;
