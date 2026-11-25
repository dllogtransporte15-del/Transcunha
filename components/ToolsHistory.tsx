import React, { useState, useEffect, useMemo } from 'react';
import { FileText, Download, Calendar, MapPin, Truck, Calculator, Clock, X, Search, User } from 'lucide-react';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getStays, getQuotes, StayRecord, QuoteRecord } from '../utils/storage';
import { getStoredCompanyLogo, addImageContain } from '../utils/pdfGenerator';

interface HistoryProps {
  companyId: string;
  companyLogo: string | null;
}

export default function History({ companyId, companyLogo }: HistoryProps) {
  const [activeTab, setActiveTab] = useState<'stays' | 'quotes'>('stays');
  const [stays, setStays] = useState<StayRecord[]>([]);
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);

  // Filters
  const [filterClient, setFilterClient] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterDriverOrPlate, setFilterDriverOrPlate] = useState('');

  useEffect(() => {
    setStays(getStays(companyId));
    setQuotes(getQuotes(companyId));
  }, [companyId]);

  const clearFilters = () => {
    setFilterClient('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterDriverOrPlate('');
  };

  const hasFilters = filterClient || filterDateFrom || filterDateTo || filterDriverOrPlate;

  const filteredStays = useMemo(() => {
    return stays.filter(s => {
      if (filterClient && !s.clientName?.toLowerCase().includes(filterClient.toLowerCase())) return false;
      if (filterDriverOrPlate) {
        const q = filterDriverOrPlate.toLowerCase();
        if (!s.driver?.toLowerCase().includes(q) && !s.plate?.toLowerCase().includes(q)) return false;
      }
      if (filterDateFrom || filterDateTo) {
        try {
          const date = parseISO(s.date);
          if (filterDateFrom && date < startOfDay(parseISO(filterDateFrom))) return false;
          if (filterDateTo && date > endOfDay(parseISO(filterDateTo))) return false;
        } catch { return false; }
      }
      return true;
    });
  }, [stays, filterClient, filterDriverOrPlate, filterDateFrom, filterDateTo]);

  const filteredQuotes = useMemo(() => {
    return quotes.filter(q => {
      if (filterClient && !q.clientName?.toLowerCase().includes(filterClient.toLowerCase())) return false;
      if (filterDateFrom || filterDateTo) {
        try {
          const date = parseISO(q.date);
          if (filterDateFrom && date < startOfDay(parseISO(filterDateFrom))) return false;
          if (filterDateTo && date > endOfDay(parseISO(filterDateTo))) return false;
        } catch { return false; }
      }
      return true;
    });
  }, [quotes, filterClient, filterDateFrom, filterDateTo]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const formatDate = (dateStr: string) => {
    try { return format(parseISO(dateStr), 'dd/MM/yyyy HH:mm'); }
    catch { return dateStr; }
  };

  // ─── CSV Exports ───
  const exportStaysCSV = () => {
    const headers = ['ID', 'Data', 'Cliente', 'Motorista', 'Placa', 'Origem', 'Destino', 'Tempo Total (h)', 'Valor Total'];
    const rows = filteredStays.map(s => [s.id, formatDate(s.date), s.clientName || '-', s.driver, s.plate, s.origin, s.destination, s.totalHours.toFixed(2), s.totalValue.toFixed(2)]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'historico_estadias.csv');
    link.click();
  };

  const exportQuotesCSV = () => {
    const headers = ['ID', 'Data', 'Cliente', 'Origem', 'Destino', 'Distância', 'Peso', 'Valor Motorista', 'Frete Empresa', 'Lucro'];
    const rows = filteredQuotes.map(q => [q.id, formatDate(q.date), q.clientName || '-', q.origin, q.destination, `${q.distance} km`, `${q.weight} Ton`, q.driverTotalValue.toFixed(2), q.companyTotalFreight.toFixed(2), q.carrierNetProfit.toFixed(2)]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'historico_cotacoes.csv');
    link.click();
  };

  // ─── PDF Exports ───
  const exportStaysPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const logo = companyLogo || getStoredCompanyLogo();
    // Logo e Cabeçalho (Alinhados)
    const hasLogo = !!logo;
    const logoSize = 12;

    if (hasLogo && logo) {
      addImageContain(doc, logo, 14, 10, logoSize, logoSize, 'center', 'center');
    }

    doc.setFontSize(20);
    doc.setTextColor(40, 40, 40);
    doc.setFont('helvetica', 'bold');
    doc.text('TRANSCUNHA', hasLogo ? 30 : 14, 19);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Histórico de Estadias', hasLogo ? 30 : 14, 25);

    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy')} | Total: ${filteredStays.length} registros`, 14, 32);

    autoTable(doc, {
      startY: 38,
      head: [['ID / DATA', 'CLIENTE', 'MOTORISTA / PLACA', 'ROTA', 'TEMPOS', 'VALOR TOTAL']],
      body: filteredStays.map(s => [
        `#${s.id.slice(-6)}\n${formatDate(s.date)}`,
        s.clientName || '-',
        `${s.driver}\n${s.plate}${s.invoice ? '\nNF: ' + s.invoice : ''}`,
        `De: ${s.origin}\nPara: ${s.destination}`,
        `${s.totalHours.toFixed(1)}h totais\nTolerância: ${s.tolerance}h`,
        formatCurrency(s.totalValue),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 5: { halign: 'right', fontStyle: 'bold' } },
    });
    doc.save('historico_estadias.pdf');
  };

  const exportQuotesPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const logo = companyLogo || getStoredCompanyLogo();

    // Logo e Cabeçalho (Alinhados)
    let currentY = 22;
    const hasLogo = !!logo;
    const logoSize = 12; // Menor e mais discreto

    if (hasLogo && logo) {
      addImageContain(doc, logo, 14, 10, logoSize, logoSize, 'center', 'center');
    }

    doc.setFontSize(20);
    doc.setTextColor(40, 40, 40);
    doc.setFont('helvetica', 'bold');
    // x=28 se tiver logo (14+12+2 de respiro); y=19 para alinhar com o centro vertical da logo de 12mm
    doc.text('TRANSCUNHA', hasLogo ? 30 : 14, 19);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    // Subtítulo logo abaixo do nome
    doc.text('Relatório de Cotações de Frete', hasLogo ? 30 : 14, 25);

    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy')} | Total: ${filteredQuotes.length} registros`, 14, 32);

    autoTable(doc, {
      startY: 38,
      head: [['DATA', 'CLIENTE', 'ORIGEM', 'DESTINO', 'FRETE EMPRESA (R$/TON)']],
      body: filteredQuotes.map(q => [
        formatDate(q.date),
        q.clientName || '-',
        q.origin,
        q.destination,
        formatCurrency(q.companyFreightPerTon),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold', fontSize: 10 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 
        4: { halign: 'right', fontStyle: 'bold' }
      },
      margin: { top: 20 }
    });
    doc.save('historico_cotacoes.pdf');
  };

  const activeData = activeTab === 'stays' ? filteredStays : filteredQuotes;
  const totalData = activeTab === 'stays' ? stays : quotes;

  return (
    <div className="space-y-4">

      {/* ─── Tab Bar + Export Buttons ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex bg-white rounded-lg p-1 border border-slate-200 self-start">
          <button
            onClick={() => setActiveTab('stays')}
            className={`flex items-center py-2 px-4 rounded-md text-sm font-medium transition-colors ${activeTab === 'stays' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Clock className="w-4 h-4 mr-2" />
            Histórico de Estadias
          </button>
          <button
            onClick={() => setActiveTab('quotes')}
            className={`flex items-center py-2 px-4 rounded-md text-sm font-medium transition-colors ${activeTab === 'quotes' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Calculator className="w-4 h-4 mr-2" />
            Histórico de Cotações
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={activeTab === 'stays' ? exportStaysCSV : exportQuotesCSV}
            className="flex items-center text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-lg transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
            Exportar CSV
          </button>
          <button
            onClick={activeTab === 'stays' ? exportStaysPDF : exportQuotesPDF}
            className="flex items-center text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 px-3 py-2 rounded-lg transition-colors shadow-sm"
          >
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            PDF (Lista)
          </button>
        </div>
      </div>

      {/* ─── Filters ─── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Filtros de Busca</span>
          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center text-xs text-red-500 hover:text-red-700 font-medium transition-colors">
              <X className="w-3.5 h-3.5 mr-1" /> Limpar Filtros
            </button>
          )}
        </div>

        <div className="relative">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-slate-400" />
          </div>
          <input
            type="text"
            value={filterClient}
            onChange={e => setFilterClient(e.target.value)}
            placeholder="Filtrar por Cliente"
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <Calendar className="w-4 h-4 text-slate-400" />
            </div>
            <input
              type="date"
              value={filterDateFrom}
              onChange={e => setFilterDateFrom(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none"
            />
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <Calendar className="w-4 h-4 text-slate-400" />
            </div>
            <input
              type="date"
              value={filterDateTo}
              onChange={e => setFilterDateTo(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none"
            />
          </div>
          {activeTab === 'stays' && (
            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <User className="w-4 h-4 text-slate-400" />
              </div>
              <input
                type="text"
                value={filterDriverOrPlate}
                onChange={e => setFilterDriverOrPlate(e.target.value)}
                placeholder="Filtrar por Motorista ou Placa"
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none"
              />
            </div>
          )}
        </div>

        <p className="text-xs text-indigo-600 font-medium">
          Foram encontrados <strong>{activeData.length}</strong> registros
          {activeData.length !== totalData.length && ` de ${totalData.length}`} para este filtro.
        </p>
      </div>

      {/* ─── Table ─── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {activeTab === 'stays' ? (
                  <>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">ID / DATA</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">CLIENTE</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">MOTORISTA / PLACA</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">ROTA</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">TEMPOS</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">VALOR TOTAL</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">AÇÕES</th>
                  </>
                ) : (
                  <>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">ID / DATA</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">CLIENTE</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">ROTA</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">CARGA</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">FRETE EMPRESA</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">LUCRO LÍQUIDO</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">AÇÕES</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeTab === 'stays' ? (
                filteredStays.length > 0 ? filteredStays.map(stay => (
                  <tr key={stay.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-xs font-mono text-slate-400">#{stay.id.slice(-6)}</div>
                      <div className="flex items-center mt-1 text-xs text-slate-500">
                        <Calendar className="w-3 h-3 mr-1 flex-shrink-0" />
                        {formatDate(stay.date)}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{stay.clientName || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-800 font-medium">{stay.driver}</div>
                      <div className="text-xs text-slate-500 flex items-center mt-0.5">
                        <Truck className="w-3 h-3 mr-1" />{stay.plate}
                      </div>
                      {stay.invoice && <div className="text-xs text-slate-400 mt-0.5">NF: {stay.invoice}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-slate-600 flex items-center"><MapPin className="w-3 h-3 mr-1 text-emerald-500 flex-shrink-0" />{stay.origin}</div>
                      <div className="text-xs text-slate-600 flex items-center mt-1"><MapPin className="w-3 h-3 mr-1 text-red-500 flex-shrink-0" />{stay.destination}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-800">{stay.totalHours.toFixed(1)}h totais</div>
                      <div className="text-xs text-slate-400 mt-0.5">Tolerância: {stay.tolerance}h</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold text-emerald-600">{formatCurrency(stay.totalValue)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-slate-400">—</span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                )
              ) : (
                filteredQuotes.length > 0 ? filteredQuotes.map(quote => (
                  <tr key={quote.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-xs font-mono text-slate-400">#{quote.id.slice(-6)}</div>
                      <div className="flex items-center mt-1 text-xs text-slate-500">
                        <Calendar className="w-3 h-3 mr-1 flex-shrink-0" />
                        {formatDate(quote.date)}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{quote.clientName || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-slate-600 flex items-center"><MapPin className="w-3 h-3 mr-1 text-emerald-500 flex-shrink-0" />{quote.origin}</div>
                      <div className="text-xs text-slate-600 flex items-center mt-1"><MapPin className="w-3 h-3 mr-1 text-indigo-500 flex-shrink-0" />{quote.destination}</div>
                      <div className="text-[10px] text-slate-400 mt-1 font-medium">{quote.distance} km</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-800 font-medium">{quote.weight} Ton</div>
                      <div className="text-xs text-slate-500">{quote.axes} Eixos · {quote.cargoType}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-semibold text-slate-800">{formatCurrency(quote.companyTotalFreight)}</div>
                      <div className="text-xs text-slate-400">{formatCurrency(quote.companyFreightPerTon)}/ton</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-bold text-emerald-600">{formatCurrency(quote.carrierNetProfit)}</div>
                      <div className="mt-0.5">
                        <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full">
                          {quote.carrierProfitMargin.toFixed(1)}% margem
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-slate-400">—</span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
