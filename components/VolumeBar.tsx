
import React from 'react';

interface VolumeBarProps {
  loaded: number;
  scheduled: number;
  total: number;
  loadedColor?: string;
  scheduledColor?: string;
  onClick?: () => void;
}

const VolumeBar: React.FC<VolumeBarProps> = ({ 
    loaded, 
    scheduled, 
    total, 
    loadedColor = 'bg-green-500', 
    scheduledColor = 'bg-orange-400',
    onClick
}) => {
  const loadedPercentage = total > 0 ? (loaded / total) * 100 : 0;
  const scheduledPercentage = total > 0 ? (scheduled / total) * 100 : 0;
  
  return (
    <div 
      className={`group/bar w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 flex overflow-hidden transition-all duration-200 ${onClick ? 'cursor-pointer hover:h-3 hover:ring-2 hover:ring-primary/25 dark:hover:ring-sky-400/25 hover:shadow-sm' : 'hover:h-3'}`}
      onClick={onClick}
    >
      <div
        className={`${loadedColor} h-full transition-all duration-300 group-hover/bar:brightness-110`}
        style={{ width: `${loadedPercentage}%` }}
        title={`Carregado: ${loaded.toLocaleString('pt-BR')} ton`}
      ></div>
      <div
        className={`${scheduledColor} h-full transition-all duration-300 group-hover/bar:brightness-110`}
        style={{ width: `${scheduledPercentage}%` }}
        title={`Agendado: ${scheduled.toLocaleString('pt-BR')} ton`}
      ></div>
    </div>
  );
};

export default VolumeBar;
