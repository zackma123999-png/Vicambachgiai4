"use client";

import { FrameSequenceHero, type FrameSequenceStep } from "@/components/ui/mac-book-neo-hero";

// Dùng 8 bìa truyện thật thay cho 941 khung hình video từ nguồn ngoài
// (không tải được trong sandbox, và cũng không liên quan tới nội dung
// ViCamBachGiai). Mỗi "bước" tương ứng đúng 1 trong 4 tab của Kệ Truyện.
const COVERS = [
  "cover-nhanluc.jpg",
  "cover-vuotrao.jpg",
  "cover-phu-sinh-nhuoc-mong.jpg",
  "cover-nep-gap.jpg",
  "cover-kinh-vi-vo-gian.jpg",
  "cover-chuyen-bay-dem.jpg",
  "cover-doat-vo.jpg",
  "cover-dem-nay-tinh-ruou.jpg",
];
const FRAME_COUNT = COVERS.length;
const framePath = (i: number) => `/covers/${COVERS[(i - 1) % COVERS.length]}`;

const steps: FrameSequenceStep[] = [
  { from: 0.02, to: 0.28, color: "#26c2dc", num: "01", total: "04", icon: "✦",
    title: "Trạm Preview",
    description: "Teaser TikTok phát ngay tại chỗ, không cần rời trang.",
    label: "Preview" },
  { from: 0.28, to: 0.55, color: "#69e6f3", num: "02", total: "04", icon: "◐",
    title: "Đang lên sóng",
    description: "Những bộ truyện đang cập nhật đều đặn mỗi tuần.",
    label: "Lên sóng" },
  { from: 0.55, to: 0.82, color: "#9b6bff", num: "03", total: "04", icon: "▣",
    title: "Đã hoàn thành",
    description: "Trọn bộ, đọc một mạch không phải chờ chương mới.",
    label: "Hoàn thành" },
  { from: 0.82, to: 1.01, color: "#a37bff", num: "04", total: "04", icon: "⌁",
    title: "Sắp ra mắt",
    description: "Những câu chuyện mới đang được chuẩn bị tại ViCamBachGiai.",
    label: "Sắp ra mắt" },
];

export default function FrameHeroDemo() {
  return (
    <FrameSequenceHero
      frameCount={FRAME_COUNT}
      framePath={framePath}
      eagerCount={FRAME_COUNT}
      scrollHeight="500vh"
      brand={
        <>
          <span className="fsh-brand-dot" />
          ViCamBachGiai
        </>
      }
      navLinks={[
        { label: "Trang chủ", href: "#" },
        { label: "Khám phá", href: "#" },
        { label: "Tủ truyện", href: "#" },
      ]}
      ctaLabel="Đọc ngay"
      ctaHref="#"
      title={
        <>
          <span className="fsh-title-dark">Kệ Truyện</span>{" "}
          <span className="fsh-title-rainbow">ViCamBachGiai</span>
        </>
      }
      subtitle="Cuộn để khám phá."
      steps={steps}
    />
  );
}
