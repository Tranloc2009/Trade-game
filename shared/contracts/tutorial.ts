export interface TutorialQuizExercise {
  kind: 'QUIZ';
  questionVi: string;
  options: Array<{ id: string; labelVi: string }>;
  correctOptionId: string;
}

export interface TutorialLesson {
  id: string;
  order: number;
  titleVi: string;
  objectiveVi: string;
  targetPage: 'overview' | 'discover' | 'exchange' | 'portfolio' | 'forex' | 'futures';
  highlightSelector?: string;
  instructionsVi: string[];
  exampleVi: string;
  exercise: TutorialQuizExercise;
  resultExplanationVi: string;
}

/**
 * 10-Lesson Progressive Trading Curriculum — 100% deterministic, skippable, pausable, reopenable anytime.
 * Zero AI API calls, zero incentives for high-frequency or high-leverage trading.
 */
export const TUTORIAL_LESSONS: TutorialLesson[] = [
  {
    id: 'lesson_1_cr_wallet',
    order: 1,
    titleVi: 'Bài 1: Hiểu tiền CR và Ví tài khoản',
    objectiveVi: 'Phân biệt CR mô phỏng, Số dư khả dụng và Số dư đang khóa.',
    targetPage: 'overview',
    highlightSelector: '[data-tutorial="wallet-summary"]',
    instructionsVi: [
      'CR (Credits) là đơn vị tiền mô phỏng dùng trong toàn bộ thế giới Trading Empire — không phải tiền thật.',
      'Số dư khả dụng là tiền bạn có thể dùng ngay để mua tài sản, gửi tiết kiệm hoặc mở công ty.',
      'Số dư đang khóa là tiền đang tạm giữ cho các lệnh chờ khớp; khi hủy lệnh, tiền sẽ trả về khả dụng.',
    ],
    exampleVi: 'Nếu bạn có 100,000 CR và đặt lệnh chờ mua 10,000 CR, bạn còn 90,000 CR khả dụng và 10,000 CR đang khóa.',
    exercise: {
      kind: 'QUIZ',
      questionVi: 'Khi bạn hủy một lệnh chờ mua trị giá 5,000 CR, số tiền đó sẽ đi đâu?',
      options: [
        { id: 'a', labelVi: 'Quay trở lại Số dư khả dụng trong ví của bạn' },
        { id: 'b', labelVi: 'Bị mất vĩnh viễn khỏi tài khoản' },
        { id: 'c', labelVi: 'Tự động mua tài sản khác' },
      ],
      correctOptionId: 'a',
    },
    resultExplanationVi: 'Chính xác! Tiền đang khóa chỉ được tạm giữ để đảm bảo thanh toán và luôn được hoàn trả khi hủy lệnh.',
  },
  {
    id: 'lesson_2_price_chart',
    order: 2,
    titleVi: 'Bài 2: Đọc giá và biểu đồ đơn giản',
    objectiveVi: 'Hiểu giá hiện tại, phần trăm biến động 24h và biểu đồ đường giá.',
    targetPage: 'discover',
    highlightSelector: '[data-tutorial="asset-discovery"]',
    instructionsVi: [
      'Giá hiện tại phản ánh giao dịch khớp lệnh gần nhất trên sàn.',
      'Mức biến động 24h (kèm dấu + hoặc -) cho biết giá tăng hay giảm bao nhiêu phần trăm so với đầu chu kỳ.',
      'Biểu đồ đường đơn giản giúp bạn nhìn xu hướng chung trước khi cần đến biểu đồ nến nâng cao.',
    ],
    exampleVi: 'NOVA giá 50.00 CR (+1.63%) nghĩa là giá đang cao hơn 1.63% so với giá mở cửa 24h trước.',
    exercise: {
      kind: 'QUIZ',
      questionVi: 'Một tài sản có nhãn "Biến động cao" có ý nghĩa gì?',
      options: [
        { id: 'a', labelVi: 'Chắc chắn sẽ tăng giá nhanh trong ngày hôm nay' },
        { id: 'b', labelVi: 'Giá có thể tăng hoặc giảm rất mạnh trong thời gian ngắn' },
        { id: 'c', labelVi: 'Không thể bán ra khi muốn' },
      ],
      correctOptionId: 'b',
    },
    resultExplanationVi: 'Đúng! Biến động cao nghĩa là biên độ dao động lớn theo cả hai chiều tăng và giảm — không bao giờ là đảm bảo sinh lời.',
  },
  {
    id: 'lesson_3_first_buy',
    order: 3,
    titleVi: 'Bài 3: Thực hiện lệnh Mua đầu tiên (Chế độ Luyện tập)',
    objectiveVi: 'Nắm quy trình 3 bước: Nhập số tiền -> Xem trước -> Xác nhận.',
    targetPage: 'exchange',
    highlightSelector: '[data-tutorial="simple-trade-panel"]',
    instructionsVi: [
      'Bạn có thể bật "Phòng Luyện Tập (100,000 CR)" bất kỳ lúc nào để thực hành tách biệt hoàn toàn khỏi tài khoản chính.',
      'Bước 1: Chọn MUA và nhập số CR muốn bỏ ra (ví dụ 10% số dư, không nên dồn 100% vào một mã).',
      'Bước 2: Đọc kỹ màn hình Xem trước gồm phí giao dịch, giá ước tính và số dư còn lại rồi nhấn Xác nhận.',
    ],
    exampleVi: 'Mua 1,000 CR cổ phiếu NOVA ở giá ước tính 50 CR -> nhận khoảng 19–20 cổ phiếu sau khi trừ phí giao dịch.',
    exercise: {
      kind: 'QUIZ',
      questionVi: 'Màn hình "Xem trước giao dịch" trước khi xác nhận có tác dụng gì?',
      options: [
        { id: 'a', labelVi: 'Khóa cứng giá vĩnh viễn cho bạn' },
        { id: 'b', labelVi: 'Giúp bạn kiểm tra khối lượng ước tính, phí và số dư còn lại trước khi gửi lệnh' },
        { id: 'c', labelVi: 'Tự động vay thêm tiền nếu không đủ số dư' },
      ],
      correctOptionId: 'b',
    },
    resultExplanationVi: 'Chuẩn xác! Bước Xem trước giúp bạn kiểm soát rõ chi phí, phí giao dịch và cảnh báo thanh khoản trước khi bấm Xác nhận.',
  },
  {
    id: 'lesson_4_sell_asset',
    order: 4,
    titleVi: 'Bài 4: Bán tài sản đang sở hữu',
    objectiveVi: 'Hiểu số lượng khả dụng để bán và cách tiền CR về ví.',
    targetPage: 'exchange',
    highlightSelector: '[data-tutorial="simple-trade-panel"]',
    instructionsVi: [
      'Khi chuyển sang tab BÁN, bạn chỉ có thể bán tối đa số lượng tài sản Khả dụng (không tính phần đang đặt lệnh chờ).',
      'Khi lệnh bán khớp thành công, tài sản được trừ đi và tiền CR (sau phí giao dịch) cộng ngay vào Số dư khả dụng.',
      'Lệnh đã khớp hoàn toàn sẽ tự động biến mất khỏi "Lệnh đang mở" và chuyển vào Lịch sử.',
    ],
    exampleVi: 'Sở hữu 20 NOVA khả dụng, bán 10 NOVA ở 52 CR -> nhận 520 CR trừ phí, còn lại 10 NOVA trong danh mục.',
    exercise: {
      kind: 'QUIZ',
      questionVi: 'Bạn có 15 NOVA nhưng đang treo lệnh chờ bán 5 NOVA. Bạn có thể bán thêm ngay tối đa bao nhiêu NOVA?',
      options: [
        { id: 'a', labelVi: '15 NOVA' },
        { id: 'b', labelVi: '10 NOVA (phần khả dụng)' },
        { id: 'c', labelVi: '20 NOVA' },
      ],
      correctOptionId: 'b',
    },
    resultExplanationVi: 'Chính xác! 5 NOVA đang bị khóa cho lệnh chờ, nên số lượng khả dụng để đặt lệnh bán mới là 10 NOVA.',
  },
  {
    id: 'lesson_5_read_pnl',
    order: 5,
    titleVi: 'Bài 5: Đọc Lời / Lỗ (PnL)',
    objectiveVi: 'Phân biệt Giá vốn trung bình, Lời/Lỗ tạm tính và Lời/Lỗ đã chốt.',
    targetPage: 'portfolio',
    highlightSelector: '[data-tutorial="portfolio-summary"]',
    instructionsVi: [
      'Giá vốn trung bình là mức giá bình quân bạn đã bỏ ra để mua tài sản đó.',
      'Lời/Lỗ tạm tính (Unrealized PnL) thay đổi liên tục theo giá thị trường khi bạn chưa bán.',
      'Lời/Lỗ đã chốt (Realized PnL) là kết quả cuối cùng được kết toán vào ví CR sau khi bán.',
    ],
    exampleVi: 'Giá vốn 50 CR, giá hiện tại 54 CR cho 10 cổ phiếu => Lời tạm tính +40 CR (+8.0%).',
    exercise: {
      kind: 'QUIZ',
      questionVi: 'Khi nào Lời tạm tính thực sự trở thành Lời đã chốt trong ví CR?',
      options: [
        { id: 'a', labelVi: 'Ngay khi giá tăng trên biểu đồ' },
        { id: 'b', labelVi: 'Khi bạn bán tài sản (hoặc đóng vị thế) thành công' },
        { id: 'c', labelVi: 'Sau mỗi 5 phút tự động' },
      ],
      correctOptionId: 'b',
    },
    resultExplanationVi: 'Đúng rồi! Lời/Lỗ tạm tính có thể đổi chiều bất cứ lúc nào cho đến khi bạn thực sự bán hoặc đóng vị thế.',
  },
  {
    id: 'lesson_6_market_vs_limit',
    order: 6,
    titleVi: 'Bài 6: So sánh Mua theo thị trường và Đặt giá mong muốn',
    objectiveVi: 'Chọn đúng loại lệnh (Market vs Limit) theo mục tiêu giao dịch.',
    targetPage: 'exchange',
    highlightSelector: '[data-tutorial="order-type-selector"]',
    instructionsVi: [
      'Mua/Bán theo thị trường (Market Order): ưu tiên tốc độ, khớp ngay theo sổ lệnh hiện tại.',
      'Đặt giá mong muốn (Limit Order): ưu tiên kiểm soát giá, lệnh chờ đến khi có người khớp mức giá bạn đặt.',
      'Nếu lệnh Limit chưa khớp ngay, nó sẽ nằm trong mục "Lệnh đang mở" để bạn theo dõi hoặc hủy bất cứ lúc nào.',
    ],
    exampleVi: 'BTC-SIM đang 64,200 CR: đặt Limit Buy 63,500 CR sẽ chờ giá giảm tới 63,500 CR mới khớp.',
    exercise: {
      kind: 'QUIZ',
      questionVi: 'Nếu bạn chỉ muốn mua cổ phiếu khi giá giảm về đúng mức bạn chọn, bạn nên dùng loại lệnh nào?',
      options: [
        { id: 'a', labelVi: 'Mua theo thị trường (Market Order)' },
        { id: 'b', labelVi: 'Đặt giá mong muốn (Limit Order)' },
        { id: 'c', labelVi: 'Không thể đặt trước mức giá mong muốn' },
      ],
      correctOptionId: 'b',
    },
    resultExplanationVi: 'Chính xác! Limit Order giúp bạn kiểm soát mức giá tối đa khi mua hoặc tối thiểu khi bán.',
  },
  {
    id: 'lesson_7_portfolio',
    order: 7,
    titleVi: 'Bài 7: Quản lý Danh mục & Tài sản ròng',
    objectiveVi: 'Hiểu phân bổ tài sản giữa Tiền mặt, Cổ phiếu, Crypto, Ngoại hối, Bất động sản và Doanh nghiệp.',
    targetPage: 'portfolio',
    highlightSelector: '[data-tutorial="portfolio-summary"]',
    instructionsVi: [
      'Trading Empire không chỉ có giao dịch chứng khoán/crypto — bạn còn có thể sở hữu Bất động sản, lập Doanh nghiệp và gửi Ngân hàng.',
      'Tổng Tài sản ròng bằng toàn bộ tài sản bạn đang có trừ đi tổng nợ vay.',
      'Tiền đang khóa cho lệnh chờ hoặc ký quỹ Futures chỉ được tính đúng 1 lần, không tính trùng.',
    ],
    exampleVi: 'Chia vốn giữa tiền mặt dự phòng, cổ phiếu, tài sản số và doanh nghiệp giúp danh mục bền vững hơn.',
    exercise: {
      kind: 'QUIZ',
      questionVi: 'Tổng Tài sản ròng (Net Worth) được tính như thế nào?',
      options: [
        { id: 'a', labelVi: 'Chỉ tính tiền mặt khả dụng trong ví' },
        { id: 'b', labelVi: 'Tổng giá trị tất cả tài sản và tiền mặt trừ đi tổng nợ vay' },
        { id: 'c', labelVi: 'Tổng giá trị tài sản cộng thêm tổng nợ vay' },
      ],
      correctOptionId: 'b',
    },
    resultExplanationVi: 'Tuyệt vời! Nợ vay là nghĩa vụ phải trả nên luôn được trừ đi khi tính Tài sản ròng.',
  },
  {
    id: 'lesson_8_risk_management',
    order: 8,
    titleVi: 'Bài 8: Quản trị rủi ro cơ bản',
    objectiveVi: 'Tránh dồn toàn bộ vốn vào một lệnh và biết kiểm soát quy mô giao dịch.',
    targetPage: 'exchange',
    highlightSelector: '[data-tutorial="simple-trade-panel"]',
    instructionsVi: [
      'Không bao giờ bắt buộc phải dùng 100% số dư vào một tài sản duy nhất.',
      'Luôn giữ lại một phần CR dự phòng để ứng phó biến động hoặc tận dụng cơ hội ở mảng Doanh nghiệp / Bất động sản.',
      'Cẩn trọng với các mã biến động cao (như Meme Coin) và luôn đọc kỹ cảnh báo thanh khoản.',
    ],
    exampleVi: 'Thay vì bỏ toàn bộ 100,000 CR vào 1 mã coin biến động cao, chỉ phân bổ 10%–25% cho mỗi vị thế.',
    exercise: {
      kind: 'QUIZ',
      questionVi: 'Nguyên tắc an toàn cơ bản khi mới bắt đầu giao dịch là gì?',
      options: [
        { id: 'a', labelVi: 'Luôn dùng 100% số dư vào mã tăng mạnh nhất' },
        { id: 'b', labelVi: 'Chia nhỏ vốn hợp lý, không dồn toàn bộ số dư vào một lệnh duy nhất' },
        { id: 'c', labelVi: 'Bỏ qua phí giao dịch và cảnh báo thanh khoản' },
      ],
      correctOptionId: 'b',
    },
    resultExplanationVi: 'Chính xác! Chia nhỏ vốn và kiểm soát quy mô là kỹ năng quan trọng nhất giúp bạn trụ vững dài hạn.',
  },
  {
    id: 'lesson_9_forex_basics',
    order: 9,
    titleVi: 'Bài 9: Hiểu giao dịch Ngoại hối (Forex)',
    objectiveVi: 'Hiểu tỷ giá giữa hai đồng tiền mô phỏng, Spread và giao dịch chuyển đổi trực tiếp.',
    targetPage: 'forex',
    highlightSelector: '[data-tutorial="forex-beginner-panel"]',
    instructionsVi: [
      'Forex là giao dịch trao đổi trực tiếp giữa hai loại tiền tệ mô phỏng (ví dụ: USD-SIM và CR, hoặc EUR-SIM và USD-SIM).',
      'Tỷ giá cho biết cần bao nhiêu đơn vị tiền báo giá để đổi lấy 1 đơn vị tiền cơ sở.',
      'Giao dịch trên sàn EFX là đổi tiền tệ trực tiếp (Spot FX), khác với hợp đồng Futures có đòn bẩy.',
    ],
    exampleVi: 'Nếu cặp EUR-SIM/USD-SIM có tỷ giá 1.0850, mua 100 EUR-SIM sẽ cần khoảng 108.50 USD-SIM (cộng phí nhỏ).',
    exercise: {
      kind: 'QUIZ',
      questionVi: 'Sàn Forex EFX trong Trading Empire hoạt động theo cơ chế nào?',
      options: [
        { id: 'a', labelVi: 'Đổi trực tiếp hai loại tiền tệ mô phỏng theo tỷ giá từ sổ lệnh thực' },
        { id: 'b', labelVi: 'Tự động dùng đòn bẩy 100x cho mọi giao dịch' },
        { id: 'c', labelVi: 'Chỉ giao dịch cổ phiếu công nghệ' },
      ],
      correctOptionId: 'a',
    },
    resultExplanationVi: 'Đúng! EFX là giao dịch chuyển đổi ngoại tệ mô phỏng trực tiếp, minh bạch về tỷ giá, spread và phí.',
  },
  {
    id: 'lesson_10_futures_margin',
    order: 10,
    titleVi: 'Bài 10: Hiểu Ký quỹ, Đòn bẩy và Thanh lý (Futures)',
    objectiveVi: 'Nắm vững Long/Short, rủi ro đòn bẩy, giá thanh lý và cách dùng Stop Loss.',
    targetPage: 'futures',
    highlightSelector: '[data-tutorial="futures-beginner-panel"]',
    instructionsVi: [
      'Futures cho phép chọn Long (kỳ vọng giá tăng) hoặc Short (kỳ vọng giá giảm) bằng tiền ký quỹ CR.',
      'Đòn bẩy khuếch đại cả lời và lỗ: đòn bẩy càng cao, Giá thanh lý càng gần giá vào lệnh.',
      'Luôn xem bảng Mô phỏng Rủi ro (+1%/-1%/+5%/-5%), bắt đầu ở đòn bẩy 1x và cân nhắc đặt Cắt lỗ tự động (Stop Loss).',
    ],
    exampleVi: 'Ở đòn bẩy 1x, giá cần đi ngược rất xa mới chạm thanh lý; nhưng ở 10x, chỉ cần ngược hướng ~6–9% đã có nguy cơ bị thanh lý.',
    exercise: {
      kind: 'QUIZ',
      questionVi: 'Điều gì xảy ra khi bạn tăng mức đòn bẩy Futures từ 1x lên 10x?',
      options: [
        { id: 'a', labelVi: 'Lợi nhuận tăng còn rủi ro giữ nguyên' },
        { id: 'b', labelVi: 'Cả lời lẫn lỗ đều khuếch đại mạnh và Giá thanh lý tiến sát giá vào lệnh hơn nhiều' },
        { id: 'c', labelVi: 'Không thể bị thanh lý nếu dùng Isolated Margin' },
      ],
      correctOptionId: 'b',
    },
    resultExplanationVi: 'Xuất sắc! Bạn đã hoàn thành toàn bộ 10 bài học nền tảng của Trading Empire. Bạn có thể mở lại bất cứ bài nào bất kỳ lúc nào.',
  },
];
