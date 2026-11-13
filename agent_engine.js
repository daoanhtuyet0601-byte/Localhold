/**
 * Core AI Agent Engine for Minh An B2B Sales Opportunity Processing
 * Demonstrates:
 * 1. Extraction & Parsing Tool
 * 2. Inventory & Price Matching Tool
 * 3. Policy & Approval Evaluation Tool
 * 4. Artifact & Document Generator (Draft Email, Approval Ticket, Audit Log)
 */

class B2BSalesAgentEngine {
  constructor(catalogData) {
    this.catalog = catalogData.products || [];
    this.policies = catalogData.policies || {};
  }

  // 1. Tool / Skill 1: Extract and Validate Requirement
  extractAndValidate(rawRecord) {
    const logs = [];
    logs.push(`[Skill: ExtractAndValidate] Bắt đầu phân tích yêu cầu: ${rawRecord.id || rawRecord['Mã yêu cầu']}`);

    const id = rawRecord.id || rawRecord['Mã yêu cầu'] || 'OPP-UNKNOWN';
    const customer = rawRecord.customer || rawRecord['Tên khách hàng'] || 'Chưa rõ';
    const contactName = rawRecord.contact || rawRecord['Người liên hệ'] || 'Quý khách';
    const contactEmail = rawRecord.email || rawRecord['Email liên hệ'] || '';
    const content = rawRecord.content || rawRecord['Nội dung yêu cầu'] || '';
    const requestedDeadlineStr = rawRecord.deadline || rawRecord['Thời hạn mong muốn'] || '';
    const budgetRaw = rawRecord.budget || rawRecord['Ngân sách dự kiến (VNĐ)'] || rawRecord['Ngân sách'] || null;
    const requestedDiscountRaw = rawRecord.discount || rawRecord['Chiết khấu mong muốn (%)'] || '0';

    // Parse discount
    let requestedDiscountPct = 0;
    if (requestedDiscountRaw) {
      requestedDiscountPct = parseFloat(String(requestedDiscountRaw).replace('%', '').trim()) || 0;
    }

    // Parse budget
    let budget = null;
    if (budgetRaw !== null && budgetRaw !== undefined && String(budgetRaw).trim() !== '') {
      budget = parseFloat(String(budgetRaw).replace(/[^0-9.]/g, ''));
    }

    // Parse deadline days
    let deadlineDays = null;
    const dayMatch = requestedDeadlineStr.match(/(\d+)\s*(ngày|day|d)/i);
    if (dayMatch) {
      deadlineDays = parseInt(dayMatch[1], 10);
    }

    // Extract items using regex & catalog keyword matching
    const extractedItems = [];
    const missingItems = [];

    // Search keywords from catalog
    for (const prod of this.catalog) {
      // Find occurrences in content
      const regexTerms = [];
      if (prod.sku.includes('DELL')) regexTerms.push('Dell', 'PowerEdge', 'R750');
      else if (prod.sku.includes('CISCO')) regexTerms.push('Cisco', 'Catalyst', '9200');
      else if (prod.sku.includes('ARUBA')) regexTerms.push('Aruba', 'AP-505', 'AP505', 'Wifi');
      else if (prod.sku.includes('FORTI')) regexTerms.push('Fortinet', 'FortiGate', '60F', 'Tường lửa');
      else if (prod.sku.includes('APC')) regexTerms.push('APC', 'Smart-UPS', '3000VA', 'Bộ lưu điện');
      else if (prod.sku.includes('INSTALL')) regexTerms.push('lắp đặt', 'cấu hình', 'triển khai tiêu chuẩn');

      // Check if text mentions this product
      const isMentioned = regexTerms.some(term => content.toLowerCase().includes(term.toLowerCase()));
      if (isMentioned) {
        // Look for quantity immediately before or after the term
        // e.g. "2 Máy chủ Dell", "Switch Cisco... số lượng 4", "12 Bộ phát Wifi", "10 Bộ lưu điện"
        const patterns = [
          new RegExp(`(\\d+)\\s*(cái|chiếc|bộ|server|máy chủ|switch|tường lửa|thiết bị|bộ lưu điện|ups)?\\s*(?:[\\w\\s]{0,25})?(${regexTerms.join('|')})`, 'i'),
          new RegExp(`(${regexTerms.join('|')})(?:[\\w\\s]{0,25})?(?:số lượng|qty|sl|x)?\\s*:?\\s*(\\d+)`, 'i')
        ];

        let qty = 1; // default if not specified
        let matchedQty = false;
        for (const p of patterns) {
          const m = content.match(p);
          if (m) {
            const num = parseInt(m[1] && !isNaN(m[1]) ? m[1] : m[2], 10);
            if (!isNaN(num) && num > 0) {
              qty = num;
              matchedQty = true;
              break;
            }
          }
        }

        // Special check: did user mention item with clear quantity or just inquiry?
        extractedItems.push({
          sku: prod.sku,
          name: prod.name,
          category: prod.category,
          quantity: qty,
          listPrice: prod.list_price,
          stockAvailable: prod.stock_qty,
          leadTimeDays: prod.lead_time_days,
          explicitQtyMentioned: matchedQty
        });
        logs.push(`-> Bóc tách thành công: ${qty} x [${prod.sku}] ${prod.name}`);
      }
    }

    // Determine missing required info
    const missingFields = [];
    if (!customer || customer === 'Chưa rõ') missingFields.push('Tên khách hàng / Tổ chức');
    if (extractedItems.length === 0) missingFields.push('Hạng mục sản phẩm cụ thể');
    if (extractedItems.some(i => !i.explicitQtyMentioned && !content.toLowerCase().includes('số lượng'))) {
      // Check if content is vague
      if (content.toLowerCase().includes('quan tâm') || content.toLowerCase().includes('tư vấn')) {
        missingFields.push('Số lượng từng loại thiết bị cần mua');
      }
    }
    if (budget === null) missingFields.push('Ngân sách dự kiến');
    if (deadlineDays === null) missingFields.push('Thời hạn triển khai mong muốn');

    logs.push(`[Skill: ExtractAndValidate] Kết quả: ${extractedItems.length} hạng mục bóc tách, ${missingFields.length} thông tin còn thiếu.`);

    return {
      id,
      customer,
      contactName,
      contactEmail,
      content,
      extractedItems,
      deadlineDays,
      budget,
      requestedDiscountPct,
      missingFields,
      isValid: missingFields.length === 0,
      logs
    };
  }

  // 2. Tool / Skill 2: Inventory, Lead Time and Price Match
  matchInventoryAndPrice(extractedResult) {
    const logs = [...extractedResult.logs];
    logs.push(`[Skill: CheckInventoryAndPricing] Bắt đầu đối chiếu Tồn kho & Đơn giá cho ${extractedResult.id}`);

    const itemsAnalysis = [];
    let totalListPrice = 0;
    let maxItemLeadTime = 0;
    let isInventoryShortage = false;

    for (const item of extractedResult.extractedItems) {
      const lineTotal = item.quantity * item.listPrice;
      totalListPrice += lineTotal;

      const isStockEnough = item.stockAvailable >= item.quantity;
      if (!isStockEnough) {
        isInventoryShortage = true;
      }

      // If stock not enough, lead time doubles or requires restock (+7 days)
      const effectiveLeadTime = isStockEnough ? item.leadTimeDays : (item.leadTimeDays + 10);
      if (effectiveLeadTime > maxItemLeadTime) {
        maxItemLeadTime = effectiveLeadTime;
      }

      itemsAnalysis.push({
        ...item,
        lineTotal,
        isStockEnough,
        deficitQty: Math.max(0, item.quantity - item.stockAvailable),
        effectiveLeadTime
      });

      logs.push(`-> Đối chiếu SKU ${item.sku}: Yêu cầu ${item.quantity}, Tồn khả dụng: ${item.stockAvailable}. ` + 
        (isStockEnough ? `[Đủ kho, Lead-time: ${item.leadTimeDays} ngày]` : `[THIẾU KHO: thiếu ${item.quantity - item.stockAvailable}, Lead-time tái nhập: ${effectiveLeadTime} ngày]`));
    }

    // Check feasible delivery against customer deadline
    let isLeadTimeFeasible = true;
    let leadTimeGap = 0;
    if (extractedResult.deadlineDays !== null) {
      if (maxItemLeadTime > extractedResult.deadlineDays) {
        isLeadTimeFeasible = false;
        leadTimeGap = maxItemLeadTime - extractedResult.deadlineDays;
        logs.push(`-> [CẢNH BÁO TIẾN ĐỘ] Thời gian chuẩn bị hàng tối thiểu là ${maxItemLeadTime} ngày, nhưng khách hàng yêu cầu ${extractedResult.deadlineDays} ngày (Chênh lệch: -${leadTimeGap} ngày).`);
      } else {
        logs.push(`-> [ĐẠT TIẾN ĐỘ] Khách yêu cầu ${extractedResult.deadlineDays} ngày, Minh An đáp ứng trong ${maxItemLeadTime} ngày.`);
      }
    }

    // Calculate standard discount bracket based on order value
    let eligibleStandardDiscountPct = 0;
    let maxRepAllowedDiscountPct = 3;
    for (const rule of this.policies.discount_rules) {
      if (totalListPrice >= rule.min_order_value && totalListPrice <= rule.max_order_value) {
        eligibleStandardDiscountPct = rule.standard_discount_pct;
        maxRepAllowedDiscountPct = rule.max_rep_discount_pct;
        break;
      }
    }

    // Determine applied discount
    let appliedDiscountPct = eligibleStandardDiscountPct;
    let isSpecialDiscountRequested = false;

    if (extractedResult.requestedDiscountPct > 0) {
      if (extractedResult.requestedDiscountPct > maxRepAllowedDiscountPct) {
        isSpecialDiscountRequested = true;
        appliedDiscountPct = extractedResult.requestedDiscountPct;
      } else {
        appliedDiscountPct = Math.max(eligibleStandardDiscountPct, extractedResult.requestedDiscountPct);
      }
    }

    const discountAmount = totalListPrice * (appliedDiscountPct / 100);
    const finalProposedAmount = totalListPrice - discountAmount;

    // Check budget feasibility
    let isBudgetFeasible = true;
    let budgetGap = 0;
    if (extractedResult.budget !== null) {
      if (finalProposedAmount > extractedResult.budget) {
        isBudgetFeasible = false;
        budgetGap = finalProposedAmount - extractedResult.budget;
        logs.push(`-> [CẢNH BÁO NGÂN SÁCH] Báo giá đề xuất (${finalProposedAmount.toLocaleString('vi-VN')} đ) vượt ngân sách khách (${extractedResult.budget.toLocaleString('vi-VN')} đ) ${budgetGap.toLocaleString('vi-VN')} đ.`);
      }
    }

    return {
      ...extractedResult,
      itemsAnalysis,
      totalListPrice,
      maxItemLeadTime,
      isInventoryShortage,
      isLeadTimeFeasible,
      leadTimeGap,
      eligibleStandardDiscountPct,
      maxRepAllowedDiscountPct,
      appliedDiscountPct,
      isSpecialDiscountRequested,
      discountAmount,
      finalProposedAmount,
      isBudgetFeasible,
      budgetGap,
      logs
    };
  }

  // 3. Tool / Skill 3: Authority Gatekeeping & Status Classification
  evaluateApprovalAndClassify(evaluatedResult) {
    const logs = [...evaluatedResult.logs];
    logs.push(`[Skill: EvaluateApprovalAndDrafting] Thẩm định quy tắc phân quyền và xếp loại trạng thái.`);

    let status = 'ĐỦ ĐIỀU KIỆN TIẾP TỤC'; // 'TIẾP TỤC', 'CẦN BỔ SUNG THÔNG TIN', 'CHỜ DUYỆT', 'CHƯA ĐÁP ỨNG'
    const approvalReasons = [];
    const rejectionReasons = [];

    // Check condition 1: Missing critical info
    if (evaluatedResult.missingFields.length > 0) {
      status = 'CẦN BỔ SUNG THÔNG TIN';
      logs.push(`-> Xếp loại: [CẦN BỔ SUNG THÔNG TIN] do thiếu: ${evaluatedResult.missingFields.join(', ')}`);
    } else {
      // Check condition 2: Impossible constraints (Not feasible)
      if (!evaluatedResult.isLeadTimeFeasible && evaluatedResult.leadTimeGap >= 7) {
        status = 'CHƯA ĐÁP ỨNG';
        rejectionReasons.push(`Thời hạn khách hàng yêu cầu (${evaluatedResult.deadlineDays} ngày) quá gấp so với năng lực cung ứng (${evaluatedResult.maxItemLeadTime} ngày) do thiếu kho.`);
      } else if (!evaluatedResult.isBudgetFeasible && (evaluatedResult.budgetGap / evaluatedResult.budget) > 0.35) {
        status = 'CHƯA ĐÁP ỨNG';
        rejectionReasons.push(`Ngân sách dự kiến (${evaluatedResult.budget.toLocaleString('vi-VN')} đ) thấp hơn 35% so với mức giá tối thiểu (${evaluatedResult.finalProposedAmount.toLocaleString('vi-VN')} đ).`);
      }

      // Check condition 3: Needs Manager Approval
      if (status !== 'CHƯA ĐÁP ỨNG') {
        if (evaluatedResult.isSpecialDiscountRequested) {
          approvalReasons.push(`Chiết khấu đề xuất ${evaluatedResult.appliedDiscountPct}% vượt quyền NVKD (hạn mức tối đa là ${evaluatedResult.maxRepAllowedDiscountPct}%).`);
        }
        if (evaluatedResult.finalProposedAmount > this.policies.approval_thresholds.max_rep_order_value) {
          approvalReasons.push(`Tổng giá trị cơ hội (${evaluatedResult.finalProposedAmount.toLocaleString('vi-VN')} đ) vượt thẩm quyền NVKD (> 300,000,000 đ).`);
        }
        if (evaluatedResult.isInventoryShortage) {
          approvalReasons.push(`Tồn kho không đủ, cần bộ phận Vận hành phê duyệt đặt hàng bổ sung và cam kết lại thời hạn giao.`);
        }
        if (!evaluatedResult.isLeadTimeFeasible && evaluatedResult.leadTimeGap < 7) {
          approvalReasons.push(`Thời hạn giao hàng gấp hơn ${evaluatedResult.leadTimeGap} ngày, cần Trưởng phòng duyệt chi phí vận chuyển hỏa tốc.`);
        }

        if (approvalReasons.length > 0) {
          status = 'CHỜ DUYỆT';
          logs.push(`-> Xếp loại: [CHỜ DUYỆT] với ${approvalReasons.length} căn cứ vượt quyền.`);
        } else {
          status = 'ĐỦ ĐIỀU KIỆN TIẾP TỤC';
          logs.push(`-> Xếp loại: [ĐỦ ĐIỀU KIỆN TIẾP TỤC] - NVKD được toàn quyền xử lý.`);
        }
      }
    }

    // Generate Actionable Outputs (Draft Email, Approval Ticket, Next Steps)
    const nextSteps = this.generateNextSteps(status, evaluatedResult, approvalReasons, rejectionReasons);
    const draftEmail = this.generateDraftEmail(status, evaluatedResult, approvalReasons, rejectionReasons);
    const approvalTicket = approvalReasons.length > 0 ? this.generateApprovalTicket(evaluatedResult, approvalReasons) : null;

    return {
      ...evaluatedResult,
      status,
      approvalReasons,
      rejectionReasons,
      nextSteps,
      draftEmail,
      approvalTicket,
      logs
    };
  }

  // Helper to generate Next Steps
  generateNextSteps(status, res, approvalReasons, rejectionReasons) {
    switch (status) {
      case 'CẦN BỔ SUNG THÔNG TIN':
        return [
          `NVKD gửi email hỏi bổ sung thông tin: ${res.missingFields.join(', ')}.`,
          `Gắn nhãn cơ hội tạm dừng (On Hold - Awaiting Info) trong 48h.`,
          `Sau khi nhận phản hồi từ khách hàng, nạp lại dữ liệu để Agent định giá.`
        ];
      case 'CHỜ DUYỆT':
        return [
          `Hệ thống tự động chuyển Phiếu chuyển duyệt tới Trưởng phòng Kinh doanh.`,
          `Căn cứ thẩm định: ${approvalReasons[0]}`,
          `NVKD theo dõi trạng thái duyệt trước khi xuất báo giá chính thức.`
        ];
      case 'CHƯA ĐÁP ỨNG':
        return [
          `NVKD liên hệ giải thích vướng mắc: ${rejectionReasons.join('; ')}.`,
          `Đề xuất phương án thay thế (nới thời hạn hoặc tinh giản phạm vi thiết bị).`
        ];
      case 'ĐỦ ĐIỀU KIỆN TIẾP TỤC':
      default:
        return [
          `NVKD rà soát bản nháp Báo giá dự thảo (${res.finalProposedAmount.toLocaleString('vi-VN')} VNĐ).`,
          `Gửi email báo giá chính thức và hợp đồng nguyên tắc cho khách hàng.`,
          `Cập nhật trạng thái 'Đã gửi báo giá' lên hệ thống CRM.`
        ];
    }
  }

  // Helper to generate Draft Email
  generateDraftEmail(status, res, approvalReasons, rejectionReasons) {
    const contact = res.contactName || 'Quý khách';
    const customer = res.customer;

    if (status === 'CẦN BỔ SUNG THÔNG TIN') {
      return {
        subject: `[Minh An B2B] Tiếp nhận & Đề nghị bổ sung thông tin yêu cầu - ${customer}`,
        to: res.contactEmail || 'khachhang@doanhnghiep.vn',
        body: `Kính gửi Anh/Chị ${contact},\n\nCông ty Cổ phần Công nghệ Minh An xin chân thành cảm ơn Quý khách hàng đã quan tâm đến giải pháp thiết bị công nghệ của chúng tôi.\n\nĐể đội ngũ kỹ thuật và chuyên viên kinh doanh có thể xây dựng phương án giải pháp tối ưu kèm bảng giá chiết khấu chính xác nhất, Minh An xin phép nhờ Anh/Chị hỗ trợ làm rõ và bổ sung một số thông tin sau:\n${res.missingFields.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\nNgay khi nhận được thông tin bổ sung, Minh An sẽ hoàn tất Hồ sơ cơ hội và gửi bảng chào giá trong vòng 4 giờ làm việc.\n\nTrân trọng cảm ơn sự phối hợp của Anh/Chị,\n\nBộ phận Chăm sóc Khách hàng & Kinh doanh Doanh nghiệp\nCông ty Cổ phần Công nghệ Minh An`
      };
    }

    if (status === 'CHỜ DUYỆT') {
      return {
        subject: `[Minh An B2B] Thông báo tiếp nhận yêu cầu & Đang hoàn thiện phương án ưu đãi - ${customer}`,
        to: res.contactEmail || 'khachhang@doanhnghiep.vn',
        body: `Kính gửi Anh/Chị ${contact},\n\nMinh An đã tiếp nhận đầy đủ yêu cầu cấu hình và số lượng thiết bị của ${customer}.\n\nHiện tại, do quy mô dự án và chính sách ưu đãi chiết khấu đặc biệt theo đề nghị của Quý khách, hồ sơ đang được chuyển Trưởng bộ phận Kinh doanh phê duyệt hạn mức tối đa.\n\nChúng tôi sẽ phát hành Báo giá chính thức và phương án bàn giao dự kiến cho Anh/Chị chậm nhất vào sáng ngày làm việc tiếp theo.\n\nTrân trọng,\nĐội ngũ Kinh doanh Minh An`
      };
    }

    if (status === 'CHƯA ĐÁP ỨNG') {
      return {
        subject: `[Minh An B2B] Phản hồi về tiến độ & Khả năng đáp ứng yêu cầu - ${customer}`,
        to: res.contactEmail || 'khachhang@doanhnghiep.vn',
        body: `Kính gửi Anh/Chị ${contact},\n\nMinh An đã tiến hành rà soát tồn kho và năng lực triển khai kỹ thuật cho yêu cầu của ${customer}.\n\nTuy nhiên, sau khi đối chiếu thực tế: ${rejectionReasons.join(' ')}\n\nMinh An rất mong có thể trao đổi trực tiếp với Anh/Chị để cùng tìm giải pháp tháo gỡ (ví dụ: giao từng phần hoặc tư vấn model tương đương có sẵn).\n\nTrân trọng,\nĐội ngũ Kỹ thuật & Kinh doanh Minh An`
      };
    }

    // Standard Success Proposal
    const itemLines = res.itemsAnalysis.map((it, idx) => 
      `${idx + 1}. ${it.name} | SL: ${it.quantity} | Đơn giá: ${it.listPrice.toLocaleString('vi-VN')} đ | Thành tiền: ${it.lineTotal.toLocaleString('vi-VN')} đ`
    ).join('\n');

    return {
      subject: `[Báo giá chính thức] Giải pháp thiết bị công nghệ B2B - Minh An gửi ${customer}`,
      to: res.contactEmail || 'khachhang@doanhnghiep.vn',
      body: `Kính gửi Anh/Chị ${contact} - ${customer},\n\nCông ty Minh An xin trân trọng gửi tới Quý khách Báo giá sơ bộ cho các hạng mục thiết bị đã yêu cầu:\n\nDANH MỤC CHI TIẾT:\n${itemLines}\n\n- Tổng giá niêm yết: ${res.totalListPrice.toLocaleString('vi-VN')} VNĐ\n- Chiết khấu thương mại (${res.appliedDiscountPct}%): -${res.discountAmount.toLocaleString('vi-VN')} VNĐ\n- TỔNG GIÁ TRỊ ĐỀ XUẤT (Chưa VAT): ${res.finalProposedAmount.toLocaleString('vi-VN')} VNĐ\n- Thời gian giao hàng & triển khai cam kết: trong vòng ${res.maxItemLeadTime} ngày làm việc kể từ khi ký kết hợp đồng.\n\nBáo giá có hiệu lực trong vòng 15 ngày. Quý khách vui lòng phản hồi để chúng tôi chuẩn bị thủ tục hợp đồng.\n\nTrân trọng,\nNhân viên Kinh doanh phụ trách\nCông ty Cổ phần Công nghệ Minh An`
    };
  }

  // Helper to generate Approval Ticket
  generateApprovalTicket(res, approvalReasons) {
    return {
      ticketId: `APP-${res.id}-${Date.now().toString().slice(-4)}`,
      opportunityId: res.id,
      customer: res.customer,
      totalListPrice: res.totalListPrice,
      proposedDiscountPct: res.appliedDiscountPct,
      finalProposedAmount: res.finalProposedAmount,
      inventoryShortage: res.isInventoryShortage,
      reasons: approvalReasons,
      requestedBy: 'AI Agent (Hệ thống tiếp nhận tự động)',
      approver: 'Trưởng phòng Kinh doanh',
      status: 'PENDING_APPROVAL',
      createdAt: new Date().toISOString()
    };
  }

  // Process batch of opportunities
  processBatch(records) {
    const results = records.map(rec => {
      const step1 = this.extractAndValidate(rec);
      const step2 = this.matchInventoryAndPrice(step1);
      const step3 = this.evaluateApprovalAndClassify(step2);
      return step3;
    });

    // Summary calculation
    let countContinue = 0;
    let countNeedInfo = 0;
    let countPendingApproval = 0;
    let countNotFeasible = 0;

    let valueQualifiedOrPending = 0;

    for (const r of results) {
      if (r.status === 'ĐỦ ĐIỀU KIỆN TIẾP TỤC') {
        countContinue++;
        valueQualifiedOrPending += r.finalProposedAmount || 0;
      } else if (r.status === 'CẦN BỔ SUNG THÔNG TIN') {
        countNeedInfo++;
      } else if (r.status === 'CHỜ DUYỆT') {
        countPendingApproval++;
        valueQualifiedOrPending += r.finalProposedAmount || 0;
      } else if (r.status === 'CHƯA ĐÁP ỨNG') {
        countNotFeasible++;
      }
    }

    return {
      totalOpportunities: results.length,
      summary: {
        qualifiedCount: countContinue,
        needInfoCount: countNeedInfo,
        pendingApprovalCount: countPendingApproval,
        notFeasibleCount: countNotFeasible,
        totalQualifiedOrPendingValue: valueQualifiedOrPending
      },
      opportunities: results
    };
  }
}

// Export for node or browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { B2BSalesAgentEngine };
}
