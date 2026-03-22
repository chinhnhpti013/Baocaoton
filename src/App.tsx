/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { 
  Upload, FileSpreadsheet, Download, AlertTriangle, TrendingUp, 
  Users, Clock, CheckCircle, Filter, Search, BrainCircuit, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { ClaimData, GDVReport, ComprehensiveReport, GarageRevenueReport, Over45Report } from './types';
import { 
  processExcelData, 
  generateGDVReport, 
  generateComprehensiveReport,
  generateGarageRevenueReport,
  generateOver45DaysReport
} from './utils';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

export default function App() {
  const [data, setData] = useState<ClaimData[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState<string>('');
  const [filterGdv, setFilterGdv] = useState('');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'report1' | 'report4' | 'report5' | 'report6'>('dashboard');
  const [notification, setNotification] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);

  // Auto-hide notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Load data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem('pti_claim_data');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        // Convert date strings back to Date objects
        const processed = parsed.map((item: any) => ({
          ...item,
          receivedDate: new Date(item.receivedDate)
        }));
        setData(processed);
        generateAIInsight(processed);
      } catch (e) {
        console.error('Failed to parse saved data', e);
      }
    }
  }, []);

  // Save data to localStorage when it changes
  useEffect(() => {
    if (data.length > 0) {
      localStorage.setItem('pti_claim_data', JSON.stringify(data));
    }
  }, [data]);

  const handleReset = () => {
    setData([]);
    setAiInsight('');
    localStorage.removeItem('pti_claim_data');
    setNotification({ message: 'Đã xóa toàn bộ dữ liệu thành công.', type: 'success' });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const arrayBuffer = evt.target?.result;
        if (!arrayBuffer) throw new Error('Không thể đọc nội dung file');
        
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Read as array of arrays to find the header row manually
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];
        
        if (!rawRows || rawRows.length === 0) {
          setNotification({ message: 'File Excel không có dữ liệu.', type: 'error' });
          setLoading(false);
          return;
        }

        const processed = processExcelData(rawRows);
        
        if (processed.length === 0) {
          setNotification({ 
            message: 'Không tìm thấy dữ liệu phù hợp trong file. Vui lòng kiểm tra tiêu đề cột (GĐV thụ lý, Số HSBT, Số ngày tồn).', 
            type: 'error' 
          });
        } else {
          setData(processed);
          generateAIInsight(processed);
          setNotification({ message: `Đã tải lên thành công ${processed.length} hồ sơ.`, type: 'success' });
        }
      } catch (error) {
        console.error('Upload error:', error);
        setNotification({ message: 'Có lỗi xảy ra khi đọc file Excel. Vui lòng đảm bảo file đúng định dạng .xlsx', type: 'error' });
      } finally {
        setLoading(false);
        // Reset input to allow re-uploading the same file
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const generateAIInsight = async (claims: ClaimData[]) => {
    try {
      const gdvReport = generateGDVReport(claims);
      const summary = {
        total: claims.length,
        pending: claims.filter(c => c.isPending).length,
        over45: claims.filter(c => c.isOver45).length,
        topPendingGDV: gdvReport.sort((a, b) => b.pendingCount - a.pendingCount).slice(0, 3)
      };

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Dựa trên dữ liệu tồn hồ sơ bảo hiểm XCG của PTI Quảng Ninh:
        - Tổng hồ sơ: ${summary.total}
        - Đang giải quyết: ${summary.pending}
        - Tồn trên 45 ngày: ${summary.over45}
        - Top cán bộ tồn nhiều (GĐV thụ lý): ${summary.topPendingGDV.map(g => `${g.gdvCode} (${g.pendingCount} hồ sơ)`).join(', ')}

        Hãy đưa ra phân tích ngắn gọn (khoảng 150 từ):
        1. Cảnh báo cán bộ có tồn cao.
        2. Dự đoán rủi ro quá hạn.
        3. Gợi ý ưu tiên xử lý cho ban lãnh đạo.`,
      });
      setAiInsight(response.text || 'Không thể tạo phân tích lúc này.');
    } catch (error) {
      console.error('AI Insight Error:', error);
      setAiInsight('Lỗi khi kết nối với AI để phân tích dữ liệu.');
    }
  };

  const filteredData = useMemo(() => {
    return data.filter(item => 
      item.gdvCode.toLowerCase().includes(filterGdv.toLowerCase())
    );
  }, [data, filterGdv]);

  const gdvReport = useMemo(() => generateGDVReport(filteredData), [filteredData]);
  const comprehensiveReport = useMemo(() => generateComprehensiveReport(filteredData), [filteredData]);
  const garageRevenueReport = useMemo(() => generateGarageRevenueReport(filteredData), [filteredData]);
  const over45Report = useMemo(() => generateOver45DaysReport(filteredData), [filteredData]);

  const stats = useMemo(() => {
    const total = filteredData.length;
    const pending = filteredData.filter(c => c.isPending).length;
    const over45 = filteredData.filter(c => c.isOver45).length;
    const resolved = filteredData.filter(c => c.isResolved).length;
    return {
      total,
      pending,
      over45,
      resolved,
      // Tỷ lệ tồn (%) = Đang giải quyết / (Đã giải quyết + Đang giải quyết)
      pendingRate: total > 0 ? (pending / total * 100).toFixed(1) : '0'
    };
  }, [filteredData]);

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    
    // Report 1
    const ws1Data = gdvReport.map((r, i) => ({
      'STT': i + 1,
      'GĐV thụ lý': r.gdvCode,
      'Đã giải quyết': r.resolvedCount,
      'Đang giải quyết': r.pendingCount,
      'Tỷ lệ tồn (%)': r.pendingRate.toFixed(1),
      'Tồn <= 45 ngày': r.pendingUnder45,
      'Tồn > 45 ngày': r.pendingOver45,
      'Tỷ lệ tồn > 45 ngày (%)': r.over45Ratio.toFixed(1)
    }));
    const ws1 = XLSX.utils.json_to_sheet(ws1Data);
    XLSX.utils.book_append_sheet(wb, ws1, "Báo cáo theo GDV");

    // Report 4: Comprehensive
    const ws4Data = comprehensiveReport.map((r, i) => ({
      'STT': i + 1,
      'Mã GĐV': r.gdvCode,
      'Tồn 2025 chuyển sang': r.ton2025,
      'HSPS 2026': r.hsps2026,
      'Tổng số HS cần giải quyết': r.totalNeeded,
      'Đã giải quyết 2026': r.resolved2026,
      'Tồn 0-30 ngày': r.pending0_30,
      'Tồn 30-45 ngày': r.pending30_45,
      'Tồn 45-90 ngày': r.pending45_90,
      'Tồn > 90 ngày': r.pendingAbove90,
      'Tồn TNDS': r.pendingTNDS,
      'Tồn VCX': r.pendingVCX,
      'Tổng tồn': r.totalPending,
      'HSPS TB tháng 2025': r.avgHsps2025,
      'Tỷ lệ Tồn/Tổng (%)': r.ratioPendingTotal.toFixed(2),
      'Tỷ lệ Tồn > 45 ngày/Tổng tồn (%)': r.ratioOver45Pending.toFixed(2),
      'Tỷ lệ Tồn/HSPS TB (%)': r.ratioPendingAvg.toFixed(2),
      'Cảnh báo': r.warningLevel
    }));
    const ws4 = XLSX.utils.json_to_sheet(ws4Data);
    XLSX.utils.book_append_sheet(wb, ws4, "Báo cáo Tổng hợp");

    // Report 5: Garage Revenue
    const ws5Data = garageRevenueReport.map((r, i) => ({
      'STT': i + 1,
      'Tên Gara/SH': r.garageName,
      'Số vụ phát sinh trong năm 2026': r.claimCount,
      'Số tiền sc PS 2026 ước BT': r.totalEstimated,
      'ST sửa chữa PS 2026 đã BT': r.totalPaid
    }));
    const ws5 = XLSX.utils.json_to_sheet(ws5Data);
    XLSX.utils.book_append_sheet(wb, ws5, "Doanh thu Gara");

    // Report 6: Over 45 Days
    const ws6Data = over45Report.map((r) => ({
      'Stt': r.stt,
      'GĐV thụ lý': r.gdvCode,
      'Số HSBT': r.claimNumber,
      'Biển số xe': r.licensePlate,
      'Mã nghiệp vụ': r.type,
      'Tên garage': r.garageName,
      'Mã check': r.checkCode,
      'Mã validate': r.validateCode,
      'Tiền ước/duyệt BT': r.estimatedAmount,
      'Trạng thái hồ sơ': r.status,
      'Số ngày tồn': r.agingDays
    }));
    const ws6 = XLSX.utils.json_to_sheet(ws6Data);
    XLSX.utils.book_append_sheet(wb, ws6, "Tồn trên 45 ngày");

    XLSX.writeFile(wb, `Bao_cao_Ton_XCG_PTI_QN_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] font-sans">
      {/* Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 20 }}
            exit={{ opacity: 0, y: -50 }}
            className={cn(
              "fixed top-0 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full shadow-lg border flex items-center gap-2 min-w-[300px] justify-center",
              notification.type === 'error' ? "bg-red-50 border-red-200 text-red-700" :
              notification.type === 'success' ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
              "bg-blue-50 border-blue-200 text-blue-700"
            )}
          >
            {notification.type === 'error' ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
            <span className="text-sm font-bold">{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-lg">
              <FileSpreadsheet className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight">PTI QUẢNG NINH</h1>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Hệ thống quản lý tồn hồ sơ XCG</p>
            </div>
          </div>
          
            <div className="flex items-center gap-4">
              {data.length > 0 && (
                <button 
                  onClick={handleReset}
                  className="flex items-center gap-2 bg-white text-red-600 px-4 py-2 rounded-full hover:bg-red-50 transition-colors border border-red-200 shadow-sm"
                  title="Xóa dữ liệu cũ để cập nhật mới"
                >
                  <RefreshCw size={18} />
                  <span className="text-sm font-semibold">Reset dữ liệu</span>
                </button>
              )}
              <label className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full cursor-pointer hover:bg-emerald-100 transition-colors border border-emerald-200">
                <Upload size={18} />
                <span className="text-sm font-semibold">Tải lên Excel</span>
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
              </label>
              {data.length > 0 && (
                <button 
                  onClick={exportToExcel}
                  className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-full hover:bg-slate-800 transition-colors shadow-sm"
                >
                  <Download size={18} />
                  <span className="text-sm font-semibold">Xuất báo cáo</span>
                </button>
              )}
            </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6">
              <Upload className="text-slate-400 w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Chưa có dữ liệu</h2>
            <p className="text-slate-500 max-w-md mb-8">Vui lòng tải lên tệp Excel chứa danh sách hồ sơ bồi thường XCG để bắt đầu phân tích.</p>
            <label className="flex items-center gap-2 bg-emerald-600 text-white px-8 py-3 rounded-full cursor-pointer hover:bg-emerald-700 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-1">
              <Upload size={20} />
              <span className="font-bold">Tải lên Excel ngay</span>
              <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
        ) : (
          <div className="space-y-8">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <KpiCard title="Tổng hồ sơ nhận" value={stats.total} icon={<Users className="text-blue-600" />} color="blue" />
              <KpiCard title="Đang giải quyết" value={stats.pending} icon={<Clock className="text-amber-600" />} color="amber" />
              <KpiCard title="Tồn > 45 ngày" value={stats.over45} icon={<AlertTriangle className="text-red-600" />} color="red" />
              <KpiCard title="Tỷ lệ tồn" value={`${stats.pendingRate}%`} icon={<TrendingUp className="text-emerald-600" />} color="emerald" />
            </div>

            {/* AI Insight Section */}
            <AnimatePresence>
              {aiInsight && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl p-6 shadow-sm"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <BrainCircuit className="text-indigo-600" />
                    <h3 className="font-bold text-indigo-900">AI Phân tích & Gợi ý</h3>
                  </div>
                  <div className="text-indigo-800 leading-relaxed whitespace-pre-wrap text-sm italic">
                    {aiInsight}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 overflow-x-auto">
              <TabButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} label="Dashboard" />
              <TabButton active={activeTab === 'report4'} onClick={() => setActiveTab('report4')} label="Báo cáo Tổng hợp" />
              <TabButton active={activeTab === 'report1'} onClick={() => setActiveTab('report1')} label="Báo cáo GĐV thụ lý" />
              <TabButton active={activeTab === 'report5'} onClick={() => setActiveTab('report5')} label="Doanh thu Gara" />
              <TabButton active={activeTab === 'report6'} onClick={() => setActiveTab('report6')} label="Tồn trên 45 ngày" />
            </div>

            {/* Content */}
            <div className="min-h-[500px]">
              {activeTab === 'dashboard' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <ChartContainer title="Tình trạng hồ sơ theo GĐV thụ lý">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={gdvReport.slice(0, 10)}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="gdvCode" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="resolvedCount" name="Đã giải quyết" fill="#10b981" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="pendingCount" name="Đang giải quyết" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>

                  <ChartContainer title="Tỷ lệ trạng thái hồ sơ">
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Đã giải quyết', value: stats.resolved },
                            { name: 'Tồn <= 45 ngày', value: stats.pending - stats.over45 },
                            { name: 'Tồn > 45 ngày', value: stats.over45 },
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {COLORS.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>
              )}

              {activeTab === 'report1' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold">Thống kê chi tiết theo GĐV thụ lý</h3>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <input 
                        type="text" 
                        placeholder="Tìm GĐV..." 
                        className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        value={filterGdv}
                        onChange={(e) => setFilterGdv(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse border border-slate-300">
                      <thead className="bg-yellow-50 text-slate-700 uppercase text-[11px] font-bold tracking-wider text-center">
                        <tr>
                          <th className="px-6 py-4 border border-slate-300">STT</th>
                          <th className="px-6 py-4 border border-slate-300">GĐV thụ lý</th>
                          <th className="px-6 py-4 border border-slate-300">Đã giải quyết</th>
                          <th className="px-6 py-4 border border-slate-300">Đang giải quyết</th>
                          <th className="px-6 py-4 border border-slate-300">Tỷ lệ tồn (%)</th>
                          <th className="px-6 py-4 border border-slate-300">Tồn ≤ 45 ngày</th>
                          <th className="px-6 py-4 border border-slate-300">Tồn {'>'} 45 ngày</th>
                          <th className="px-6 py-4 border border-slate-300">Tỷ lệ tồn {'>'} 45 ngày</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {gdvReport.map((r, i) => (
                          <tr key={r.gdvCode} className="hover:bg-slate-50 transition-colors text-center">
                            <td className="px-6 py-4 border border-slate-300 font-mono text-slate-400">{i + 1}</td>
                            <td className="px-6 py-4 border border-slate-300 font-bold text-slate-900 text-left">{r.gdvCode}</td>
                            <td className="px-6 py-4 border border-slate-300 text-emerald-600 font-semibold">{r.resolvedCount}</td>
                            <td className="px-6 py-4 border border-slate-300 text-amber-600 font-semibold">{r.pendingCount}</td>
                            <td className={cn("px-6 py-4 border border-slate-300 font-bold", r.pendingRate > 50 ? "text-red-600" : "text-slate-600")}>
                              {r.pendingRate.toFixed(1)}%
                            </td>
                            <td className="px-6 py-4 border border-slate-300">{r.pendingUnder45}</td>
                            <td className={cn("px-6 py-4 border border-slate-300 font-bold", r.pendingOver45 > 0 ? "bg-yellow-50 text-amber-700" : "")}>
                              {r.pendingOver45}
                            </td>
                            <td className="px-6 py-4 border border-slate-300 font-mono text-slate-500">{r.over45Ratio.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-900 text-white font-bold text-center">
                        <tr>
                          <td className="px-6 py-4 border border-slate-800" colSpan={2}>TỔNG CỘNG</td>
                          <td className="px-6 py-4 border border-slate-800">{gdvReport.reduce((a, b) => a + b.resolvedCount, 0)}</td>
                          <td className="px-6 py-4 border border-slate-800">{gdvReport.reduce((a, b) => a + b.pendingCount, 0)}</td>
                          <td className="px-6 py-4 border border-slate-800">
                            {(gdvReport.reduce((a, b) => a + b.resolvedCount, 0) + gdvReport.reduce((a, b) => a + b.pendingCount, 0)) > 0 
                              ? (gdvReport.reduce((a, b) => a + b.pendingCount, 0) / (gdvReport.reduce((a, b) => a + b.resolvedCount, 0) + gdvReport.reduce((a, b) => a + b.pendingCount, 0)) * 100).toFixed(1)
                              : '0'}%
                          </td>
                          <td className="px-6 py-4 border border-slate-800">{gdvReport.reduce((a, b) => a + b.pendingUnder45, 0)}</td>
                          <td className="px-6 py-4 border border-slate-800 text-yellow-400">{gdvReport.reduce((a, b) => a + b.pendingOver45, 0)}</td>
                          <td className="px-6 py-4 border border-slate-800">
                            {gdvReport.reduce((a, b) => a + b.pendingCount, 0) > 0
                              ? (gdvReport.reduce((a, b) => a + b.pendingOver45, 0) / gdvReport.reduce((a, b) => a + b.pendingCount, 0) * 100).toFixed(1)
                              : '0'}%
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'report4' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-slate-50">
                    <h3 className="font-bold">Báo cáo Tổng hợp tình hình giải quyết hồ sơ</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] text-left border-collapse border border-slate-300">
                      <thead className="bg-emerald-600 text-white font-bold uppercase tracking-wider text-center">
                        <tr>
                          <th rowSpan={2} className="px-2 py-3 border border-emerald-500">Stt</th>
                          <th rowSpan={2} className="px-4 py-3 border border-emerald-500 sticky left-0 bg-emerald-600 z-10">Mã GĐV</th>
                          <th colSpan={3} className="px-4 py-2 border border-emerald-500">Tổng số HSBT cần giải quyết</th>
                          <th rowSpan={2} className="px-4 py-3 border border-emerald-500">Đã giải quyết 2026</th>
                          <th colSpan={7} className="px-4 py-2 border border-emerald-500">Tồn chưa giải quyết</th>
                          <th rowSpan={2} className="px-4 py-3 border border-emerald-500">HSPS TB 01 tháng (năm 2025)</th>
                          <th colSpan={3} className="px-4 py-2 border border-emerald-500">Tỷ lệ %</th>
                          <th rowSpan={2} className="px-4 py-3 border border-emerald-500">Cảnh báo</th>
                        </tr>
                        <tr>
                          <th className="px-2 py-2 border border-emerald-500">Tồn 2025 chuyển sang</th>
                          <th className="px-2 py-2 border border-emerald-500">HSPS 2026</th>
                          <th className="px-2 py-2 border border-emerald-500 font-black">Tổng số</th>
                          <th className="px-2 py-2 border border-emerald-500">0-30 ngày</th>
                          <th className="px-2 py-2 border border-emerald-500">30-45 ngày</th>
                          <th className="px-2 py-2 border border-emerald-500">45-90 ngày</th>
                          <th className="px-2 py-2 border border-emerald-500">{'>'} 90 ngày</th>
                          <th className="px-2 py-2 border border-emerald-500">TNDS</th>
                          <th className="px-2 py-2 border border-emerald-500">VCX</th>
                          <th className="px-2 py-2 border border-emerald-500 font-black">Tổng số</th>
                          <th className="px-2 py-2 border border-emerald-500">Tồn/Tổng HS</th>
                          <th className="px-2 py-2 border border-emerald-500">Tồn{'>'}45d/Tổng tồn</th>
                          <th className="px-2 py-2 border border-emerald-500">Tồn/HSPS TB</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {comprehensiveReport.map((r, i) => (
                          <tr key={r.gdvCode} className="hover:bg-slate-50 transition-colors text-center">
                            <td className="px-2 py-3 border border-slate-300">{i + 1}</td>
                            <td className="px-4 py-3 border border-slate-300 font-bold text-left sticky left-0 bg-white z-10">{r.gdvCode}</td>
                            <td className="px-2 py-3 border border-slate-300">{r.ton2025}</td>
                            <td className="px-2 py-3 border border-slate-300">{r.hsps2026}</td>
                            <td className="px-2 py-3 border border-slate-300 font-bold bg-slate-50">{r.totalNeeded}</td>
                            <td className="px-2 py-3 border border-slate-300 text-emerald-600 font-bold">{r.resolved2026}</td>
                            <td className="px-2 py-3 border border-slate-300">{r.pending0_30}</td>
                            <td className="px-2 py-3 border border-slate-300">{r.pending30_45}</td>
                            <td className="px-2 py-3 border border-slate-300">{r.pending45_90}</td>
                            <td className="px-2 py-3 border border-slate-300">{r.pendingAbove90}</td>
                            <td className="px-2 py-3 border border-slate-300">{r.pendingTNDS}</td>
                            <td className="px-2 py-3 border border-slate-300">{r.pendingVCX}</td>
                            <td className="px-2 py-3 border border-slate-300 font-bold bg-amber-50 text-amber-700">{r.totalPending}</td>
                            <td className="px-2 py-3 border border-slate-300 font-mono">{r.avgHsps2025.toFixed(2)}</td>
                            <td className="px-2 py-3 border border-slate-300">{r.ratioPendingTotal.toFixed(2)}%</td>
                            <td className="px-2 py-3 border border-slate-300">{r.ratioOver45Pending.toFixed(2)}%</td>
                            <td className="px-2 py-3 border border-slate-300 font-bold">{r.ratioPendingAvg.toFixed(2)}%</td>
                            <td className="px-2 py-3 border border-slate-300">
                              <span className={cn(
                                "px-2 py-1 rounded-full text-[10px] font-bold",
                                r.warningLevel === 'Cấp độ 3' ? "bg-red-100 text-red-700" :
                                r.warningLevel === 'Cấp độ 2' ? "bg-amber-100 text-amber-700" :
                                "bg-emerald-100 text-emerald-700"
                              )}>
                                {r.warningLevel}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-900 text-white font-bold text-center">
                        <tr>
                          <td className="px-2 py-4 border border-slate-700" colSpan={2}>TỔNG CỘNG</td>
                          <td className="px-2 py-4 border border-slate-700">{comprehensiveReport.reduce((a, b) => a + b.ton2025, 0)}</td>
                          <td className="px-2 py-4 border border-slate-700">{comprehensiveReport.reduce((a, b) => a + b.hsps2026, 0)}</td>
                          <td className="px-2 py-4 border border-slate-700 text-yellow-400">{comprehensiveReport.reduce((a, b) => a + b.totalNeeded, 0)}</td>
                          <td className="px-2 py-4 border border-slate-700">{comprehensiveReport.reduce((a, b) => a + b.resolved2026, 0)}</td>
                          <td className="px-2 py-4 border border-slate-700">{comprehensiveReport.reduce((a, b) => a + b.pending0_30, 0)}</td>
                          <td className="px-2 py-4 border border-slate-700">{comprehensiveReport.reduce((a, b) => a + b.pending30_45, 0)}</td>
                          <td className="px-2 py-4 border border-slate-700">{comprehensiveReport.reduce((a, b) => a + b.pending45_90, 0)}</td>
                          <td className="px-2 py-4 border border-slate-700">{comprehensiveReport.reduce((a, b) => a + b.pendingAbove90, 0)}</td>
                          <td className="px-2 py-4 border border-slate-700">{comprehensiveReport.reduce((a, b) => a + b.pendingTNDS, 0)}</td>
                          <td className="px-2 py-4 border border-slate-700">{comprehensiveReport.reduce((a, b) => a + b.pendingVCX, 0)}</td>
                          <td className="px-2 py-4 border border-slate-700 text-yellow-400">{comprehensiveReport.reduce((a, b) => a + b.totalPending, 0)}</td>
                          <td className="px-2 py-4 border border-slate-700">{comprehensiveReport.reduce((a, b) => a + b.avgHsps2025, 0).toFixed(2)}</td>
                          <td className="px-2 py-4 border border-slate-700" colSpan={4}>-</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'report5' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-slate-50">
                    <h3 className="font-bold text-blue-900 uppercase">THỐNG KÊ DOANH THU SỬA CHỮA CÁC GARAE. SHOWROOM - PS năm 2026</h3>
                    <p className="text-xs text-slate-500 mt-1">(Lọc theo 10 GR có số tiền SC PS 2026 lớn nhất)</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-center border-collapse border border-slate-300">
                      <thead className="bg-blue-600 text-white font-bold uppercase tracking-wider">
                        <tr>
                          <th className="px-4 py-3 border border-blue-500">Stt</th>
                          <th className="px-4 py-3 border border-blue-500 text-left">Tên Gara/SH</th>
                          <th className="px-4 py-3 border border-blue-500">Số vụ phát sinh trong năm 2026</th>
                          <th className="px-4 py-3 border border-blue-500">Số tiền sc PS 2026 ước BT</th>
                          <th className="px-4 py-3 border border-blue-500">ST sửa chữa PS 2026 đã BT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {garageRevenueReport.map((r, i) => (
                          <tr key={r.garageName} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 border border-slate-300 font-mono text-slate-400">{i + 1}</td>
                            <td className="px-4 py-3 border border-slate-300 font-bold text-slate-900 text-left">{r.garageName}</td>
                            <td className="px-4 py-3 border border-slate-300">{r.claimCount}</td>
                            <td className="px-4 py-3 border border-slate-300 font-semibold text-blue-600">
                              {r.totalEstimated.toLocaleString('vi-VN')}
                            </td>
                            <td className="px-4 py-3 border border-slate-300 font-semibold text-emerald-600">
                              {r.totalPaid.toLocaleString('vi-VN')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-900 text-white font-bold text-center">
                        <tr>
                          <td className="px-4 py-4 border border-slate-800" colSpan={2}>TỔNG CỘNG</td>
                          <td className="px-4 py-4 border border-slate-800">{garageRevenueReport.reduce((a, b) => a + b.claimCount, 0)}</td>
                          <td className="px-4 py-4 border border-slate-800 text-blue-400">
                            {garageRevenueReport.reduce((a, b) => a + b.totalEstimated, 0).toLocaleString('vi-VN')}
                          </td>
                          <td className="px-4 py-4 border border-slate-800 text-emerald-400">
                            {garageRevenueReport.reduce((a, b) => a + b.totalPaid, 0).toLocaleString('vi-VN')}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'report6' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-red-900 uppercase">Báo cáo tồn trên 45 ngày</h3>
                    <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold">
                      {over45Report.length} hồ sơ
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] text-left border-collapse border border-slate-300">
                      <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-center">
                        <tr>
                          <th className="px-2 py-3 border border-slate-300">Stt</th>
                          <th className="px-3 py-3 border border-slate-300">GĐV thụ lý</th>
                          <th className="px-4 py-3 border border-slate-300">Số HSBT</th>
                          <th className="px-3 py-3 border border-slate-300">Biển số xe</th>
                          <th className="px-2 py-3 border border-slate-300">Mã nghiệp vụ</th>
                          <th className="px-4 py-3 border border-slate-300 text-left">Tên garage</th>
                          <th className="px-2 py-3 border border-slate-300">Mã check</th>
                          <th className="px-2 py-3 border border-slate-300">Mã validate</th>
                          <th className="px-3 py-3 border border-slate-300">Tiền ước/duyệt BT</th>
                          <th className="px-3 py-3 border border-slate-300">Trạng thái hồ sơ</th>
                          <th className="px-2 py-3 border border-slate-300">Số ngày tồn</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {over45Report.map((r) => (
                          <tr key={r.claimNumber} className="hover:bg-red-50/30 transition-colors text-center">
                            <td className="px-2 py-3 border border-slate-300">{r.stt}</td>
                            <td className="px-3 py-3 border border-slate-300 font-bold">{r.gdvCode}</td>
                            <td className="px-4 py-3 border border-slate-300 font-mono text-[10px]">{r.claimNumber}</td>
                            <td className="px-3 py-3 border border-slate-300 font-semibold">{r.licensePlate}</td>
                            <td className="px-2 py-3 border border-slate-300">{r.type}</td>
                            <td className="px-4 py-3 border border-slate-300 text-left max-w-[200px] truncate">{r.garageName}</td>
                            <td className="px-2 py-3 border border-slate-300">{r.checkCode}</td>
                            <td className="px-2 py-3 border border-slate-300">{r.validateCode}</td>
                            <td className="px-3 py-3 border border-slate-300 font-bold text-blue-600">
                              {r.estimatedAmount.toLocaleString('vi-VN')}
                            </td>
                            <td className="px-3 py-3 border border-slate-300 italic text-slate-500">{r.status}</td>
                            <td className="px-2 py-3 border border-slate-300 font-black text-red-600 bg-red-50">{r.agingDays}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {loading && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="font-bold text-emerald-900">Đang xử lý dữ liệu...</p>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ title, value, icon, color }: { title: string, value: string | number, icon: React.ReactNode, color: string }) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-100',
    amber: 'bg-amber-50 border-amber-100',
    red: 'bg-red-50 border-red-100',
    emerald: 'bg-emerald-50 border-emerald-100',
  };

  return (
    <div className={cn("p-6 rounded-2xl border shadow-sm transition-transform hover:scale-[1.02]", colorClasses[color])}>
      <div className="flex items-center justify-between mb-4">
        <div className="p-2 bg-white rounded-lg shadow-sm">{icon}</div>
      </div>
      <div className="text-3xl font-black tracking-tight mb-1">{value}</div>
      <div className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</div>
    </div>
  );
}

function ChartContainer({ title, children, className }: { title: string, children: React.ReactNode, className?: string }) {
  return (
    <div className={cn("bg-white p-6 rounded-2xl border border-slate-200 shadow-sm", className)}>
      <h3 className="font-bold mb-6 text-slate-800">{title}</h3>
      {children}
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "px-6 py-4 text-sm font-bold transition-all relative",
        active ? "text-emerald-600" : "text-slate-400 hover:text-slate-600"
      )}
    >
      {label}
      {active && (
        <motion.div 
          layoutId="activeTab"
          className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-600 rounded-t-full"
        />
      )}
    </button>
  );
}
