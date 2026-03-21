import { ClaimData, GDVReport, ComprehensiveReport, GarageRevenueReport } from './types';

const normalizeText = (text: string): string => {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
};

export const processExcelData = (rawRows: any[][]): ClaimData[] => {
  if (rawRows.length < 1) return [];

  // Find the header row (the first row that contains any of our key columns)
  let headerIndex = -1;
  let colIndices = {
    gdv: -1,
    hsbt: -1,
    aging: -1,
    receivedDate: -1,
    type: -1, // Nghiệp vụ
    avg2025: -1, // HSPS TB 2025
    garage: -1,
    estimated: -1,
    paid: -1
  };

  for (let i = 0; i < Math.min(rawRows.length, 50); i++) { // Scan up to 50 rows
    const row = rawRows[i];
    if (!row) continue;
    
    const rowStr = row.map(c => normalizeText(String(c || '')));
    
    const gdvIdx = rowStr.findIndex(c => c.includes('gdv thu ly') || c.includes('can bo thu ly'));
    const hsbtIdx = rowStr.findIndex(c => c.includes('so hsbt') || c.includes('so ho so'));
    const agingIdx = rowStr.findIndex(c => c.includes('so ngay ton') || c.includes('ngay ton'));
    const dateIdx = rowStr.findIndex(c => c.includes('ngay mo hsbt') || c.includes('ngay tiep nhan') || c.includes('ngay nhan'));
    const typeIdx = rowStr.findIndex(c => c.includes('ma nghiep vu') || c.includes('nghiep vu') || c.includes('loai hinh'));
    const avgIdx = rowStr.findIndex(c => c.includes('hsps tb') || c.includes('trung binh 2025'));
    const garageIdx = rowStr.findIndex(c => c.includes('ten garage') || c.includes('ten gara') || c.includes('garage') || c.includes('showroom'));
    const estimatedIdx = rowStr.findIndex(c => c.includes('tien sua chua') || c.includes('tien uoc') || c.includes('duyet bt') || c.includes('uoc bt'));
    const paidIdx = rowStr.findIndex(c => c.includes('tien bt da tra cho gr') || c.includes('tien bt da tra') || c.includes('da tra cho gr') || c.includes('da tra'));

    if (gdvIdx !== -1 || hsbtIdx !== -1 || agingIdx !== -1) {
      headerIndex = i;
      colIndices = { 
        gdv: gdvIdx, 
        hsbt: hsbtIdx, 
        aging: agingIdx, 
        receivedDate: dateIdx, 
        type: typeIdx, 
        avg2025: avgIdx,
        garage: garageIdx,
        estimated: estimatedIdx,
        paid: paidIdx
      };
      break;
    }
  }

  if (headerIndex === -1) return [];

  const dataRows = rawRows.slice(headerIndex + 1);
  const startDate2026 = new Date('2026-01-01T00:00:00');
  
  // We don't filter by 2026 here because we need 2025 carryover for the comprehensive report
  return dataRows
    .filter(row => {
      const hasHsbt = colIndices.hsbt !== -1 && row[colIndices.hsbt];
      const hasGdv = colIndices.gdv !== -1 && row[colIndices.gdv];
      return hasHsbt || hasGdv;
    })
    .map((row, index) => {
      const gdvCode = colIndices.gdv !== -1 ? String(row[colIndices.gdv] || 'N/A').trim() : 'N/A';
      const claimNumber = colIndices.hsbt !== -1 ? String(row[colIndices.hsbt] || 'N/A').trim() : 'N/A';
      const agingDays = colIndices.aging !== -1 ? Number(row[colIndices.aging]) || 0 : 0;
      const type = colIndices.type !== -1 ? String(row[colIndices.type] || 'VCX').trim() : 'VCX';
      const garageName = colIndices.garage !== -1 ? String(row[colIndices.garage] || '-').trim() : '-';
      const estimatedAmount = colIndices.estimated !== -1 ? parseAmount(row[colIndices.estimated]) : 0;
      const paidAmount = colIndices.paid !== -1 ? parseAmount(row[colIndices.paid]) : 0;
      
      // Date handling
      let receivedDate = new Date();
      if (colIndices.receivedDate !== -1 && row[colIndices.receivedDate]) {
        receivedDate = parseExcelDate(row[colIndices.receivedDate]);
      }

      const isResolved = agingDays === 0;
      const isPending = agingDays > 0;
      const isOver45 = agingDays > 45;

      return {
        id: String(index),
        gdvCode,
        claimNumber,
        receivedDate,
        status: isResolved ? 'Đã giải quyết' : 'Đang giải quyết',
        type,
        agingDays,
        isResolved,
        isPending,
        isOver45,
        garageName,
        estimatedAmount,
        paidAmount
      };
    });
};

const parseExcelDate = (val: any): Date => {
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    // Excel serial date
    return new Date((val - 25569) * 86400 * 1000);
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date() : d;
};

const parseAmount = (val: any): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const str = String(val).trim();
  
  // Handle Vietnamese format: 1.234.567,89 or 1.234.567
  // If there are multiple dots, they are thousands separators
  const hasMultipleDots = (str.match(/\./g) || []).length > 1;
  const hasComma = str.includes(',');
  
  let processed = str;
  if (hasMultipleDots || (hasComma && str.indexOf('.') < str.indexOf(','))) {
    processed = str.replace(/\./g, '').replace(',', '.');
  } else {
    // US format: 1,234,567.89
    processed = str.replace(/,/g, '');
  }
  
  return Number(processed.replace(/[^0-9.-]+/g, "")) || 0;
};

export const generateGDVReport = (data: ClaimData[]): GDVReport[] => {
  const gdvMap = new Map<string, GDVReport>();
  const currentYear = 2026;

  data.filter(item => item.receivedDate.getFullYear() === currentYear).forEach(item => {
    if (!gdvMap.has(item.gdvCode)) {
      gdvMap.set(item.gdvCode, {
        gdvCode: item.gdvCode,
        resolvedCount: 0,
        pendingCount: 0,
        totalCount: 0,
        pendingRate: 0,
        pendingUnder45: 0,
        pendingOver45: 0,
        over45Ratio: 0,
      });
    }

    const report = gdvMap.get(item.gdvCode)!;
    report.totalCount++;
    
    if (item.isResolved) {
      report.resolvedCount++;
    } else {
      report.pendingCount++;
      // Tồn <= 45 ngày: Số ngày tồn =< 45 (và > 0 vì là đang giải quyết)
      if (item.agingDays <= 45) {
        report.pendingUnder45++;
      } else {
        report.pendingOver45++;
      }
    }
  });

  return Array.from(gdvMap.values()).map(report => ({
    ...report,
    // Tỷ lệ tồn (%) = Đang giải quyết / (Đã giải quyết + Đang giải quyết)
    pendingRate: (report.resolvedCount + report.pendingCount) > 0 
      ? (report.pendingCount / (report.resolvedCount + report.pendingCount)) * 100 
      : 0,
    // Tỷ lệ tồn > 45 ngày = Tổng số Tồn > 45 ngày / tổng số Đang giải quyết
    over45Ratio: report.pendingCount > 0 ? (report.pendingOver45 / report.pendingCount) * 100 : 0,
  }));
};

export const generateComprehensiveReport = (data: ClaimData[]): ComprehensiveReport[] => {
  const gdvMap = new Map<string, ComprehensiveReport>();
  const year2026 = 2026;
  const startDate2026 = new Date('2026-01-01T00:00:00');

  // Hardcoded HSPS TB 2025
  const avg2025Map: { [key: string]: number } = {
    'SONTT': 13,
    'TUNGHX': 42,
    'TUYENLM': 26,
    'CHINH05': 2,
    'DUYNT': 29,
    'VIETNT05': 19,
    'HUONGNV': 46
  };

  data.forEach(item => {
    if (!gdvMap.has(item.gdvCode)) {
      gdvMap.set(item.gdvCode, {
        gdvCode: item.gdvCode,
        ton2025: 0,
        hsps2026: 0,
        totalNeeded: 0,
        resolved2026: 0,
        pending0_30: 0,
        pending30_45: 0,
        pending45_90: 0,
        pendingAbove90: 0,
        pendingTNDS: 0,
        pendingVCX: 0,
        totalPending: 0,
        avgHsps2025: avg2025Map[item.gdvCode] || 0,
        ratioPendingTotal: 0,
        ratioOver45Pending: 0,
        ratioPendingAvg: 0,
        warningLevel: 'Cấp độ 1'
      });
    }

    const report = gdvMap.get(item.gdvCode)!;
    
    // Tồn 2025 chuyển sang: Ngày mở HSBT < 01/01/2026
    if (item.receivedDate < startDate2026) {
      report.ton2025++;
    } else {
      // HSPS 2026: Ngày mở HSBT >= 01/01/2026
      report.hsps2026++;
    }

    report.totalNeeded++;

    if (item.isResolved) {
      report.resolved2026++;
    } else {
      report.totalPending++;
      
      // Aging categories
      if (item.agingDays <= 30) report.pending0_30++;
      else if (item.agingDays <= 45) report.pending30_45++;
      else if (item.agingDays < 90) report.pending45_90++;
      else report.pendingAbove90++;

      // Nghiệp vụ theo mã cụ thể
      const typeCode = item.type.toUpperCase();
      if (typeCode === 'XO.1.1.1' || typeCode === 'XO.1.1.2') {
        report.pendingTNDS++;
      } else if (typeCode === 'XO.4.1.1') {
        report.pendingVCX++;
      } else {
        // Fallback for other codes if needed
        if (normalizeText(item.type).includes('tnds')) report.pendingTNDS++;
        else report.pendingVCX++;
      }
    }
  });

  return Array.from(gdvMap.values()).map(report => {
    // Tỷ lệ Tồn/Tổng HS = Tổng số Tồn chưa giải quyết / Tổng số HSBT cần giải quyết
    report.ratioPendingTotal = report.totalNeeded > 0 ? (report.totalPending / report.totalNeeded) * 100 : 0;
    
    // Tỷ lệ Tồn > 45d/Tổng tồn = (Tồn 45-90 ngày + Tồn > 90 ngày) / Tổng tồn chưa giải quyết
    report.ratioOver45Pending = report.totalPending > 0 ? ((report.pending45_90 + report.pendingAbove90) / report.totalPending) * 100 : 0;
    
    // Tỷ lệ Tồn/HSPS TB = Tổng tồn chưa giải quyết / HSPS TB 01 tháng (năm 2025)
    report.ratioPendingAvg = report.avgHsps2025 > 0 ? (report.totalPending / report.avgHsps2025) * 100 : 0;

    // Cấp độ dựa trên Tỷ lệ Tồn/HSPS TB
    // Cấp độ 1: Tồn/HSPS TB <= 70%
    // Cấp độ 2: Tồn/HSPS TB từ 70% đến < 130%
    // Cấp độ 3: Tồn/HSPS TB >= 130%
    if (report.ratioPendingAvg >= 130) {
      report.warningLevel = 'Cấp độ 3';
    } else if (report.ratioPendingAvg > 70) {
      report.warningLevel = 'Cấp độ 2';
    } else {
      report.warningLevel = 'Cấp độ 1';
    }

    return report;
  });
};

export const generateGarageRevenueReport = (data: ClaimData[]): GarageRevenueReport[] => {
  const garageMap = new Map<string, GarageRevenueReport>();
  const startDate2026 = new Date('2026-01-01T00:00:00');

  // Filter: Ngày mở HSBT >= 01/01/2026
  data.filter(item => item.receivedDate >= startDate2026).forEach(item => {
    // Tên Gara/SH = Tên garage
    const name = item.garageName;
    if (!garageMap.has(name)) {
      garageMap.set(name, {
        garageName: name,
        claimCount: 0,
        totalEstimated: 0,
        totalPaid: 0
      });
    }

    const report = garageMap.get(name)!;
    // Số vụ phát sinh trong năm 2026 = Count Số HSBT
    report.claimCount++;
    // Số tiền sc PS 2026 ước BT = SUM Tiền sửa chữa
    report.totalEstimated += item.estimatedAmount;
    // ST sửa chữa PS 2026 đã BT = SUM Tiền BT đã trả cho GR
    report.totalPaid += item.paidAmount;
  });

  // Lọc chọn hiển thị kết quả cho 10 "Tên Gara/SH" có "Số tiền sc PS 2026 ước BT" lớn nhất
  return Array.from(garageMap.values())
    .sort((a, b) => b.totalEstimated - a.totalEstimated)
    .slice(0, 10);
};
