'use client';

import React from 'react';
import { CircularGallery, GalleryItem } from '@/components/ui/circular-gallery';

// Real story catalog from ViCamBachGiai (js/hero-snapshot.js) — same titles,
// authors and cover art the live site shows on its own homepage hero.
const galleryData: GalleryItem[] = [
	{
		common: 'Nhân Lúc Nàng Gặp Nguy',
		binomial: 'Tần Hoài Châu',
		photo: {
			url: '/covers/cover-nhanluc.jpg',
			text: 'Bìa truyện Nhân Lúc Nàng Gặp Nguy',
			by: 'Đang tiến hành'
		}
	},
	{
		common: 'Vượt Rào',
		binomial: 'Ninh Viễn',
		photo: {
			url: '/covers/cover-vuotrao.jpg',
			text: 'Bìa truyện Vượt Rào',
			by: 'Đã hoàn thành'
		}
	},
	{
		common: 'Phù Sinh Nhược Mộng',
		binomial: 'Thanh Tương',
		photo: {
			url: '/covers/cover-phu-sinh-nhuoc-mong.jpg',
			text: 'Bìa truyện Phù Sinh Nhược Mộng',
			by: 'Đang tiến hành'
		}
	},
	{
		common: 'Nếp Gấp',
		binomial: 'Ninh Viễn',
		photo: {
			url: '/covers/cover-nep-gap.jpg',
			text: 'Bìa truyện Nếp Gấp',
			by: 'Đang tiến hành'
		}
	},
	{
		common: 'Kính Vị Vô Gian',
		binomial: 'Thỉnh Quân Mạc Tiếu',
		photo: {
			url: '/covers/cover-kinh-vi-vo-gian.jpg',
			text: 'Bìa truyện Kính Vị Vô Gian',
			by: 'Đã hoàn thành'
		}
	},
	{
		common: 'Chuyến Bay Đêm',
		binomial: 'Mẫn Nhiên',
		photo: {
			url: '/covers/cover-chuyen-bay-dem.jpg',
			text: 'Bìa truyện Chuyến Bay Đêm',
			by: 'Đang tiến hành'
		}
	},
	{
		common: 'Đoạt Vợ',
		binomial: 'Ngư Sương',
		photo: {
			url: '/covers/cover-doat-vo.jpg',
			text: 'Bìa truyện Đoạt Vợ',
			by: 'Đang tiến hành'
		}
	},
	{
		common: 'Đêm Nay Tỉnh Rượu',
		binomial: 'Thời Vi Nguyệt Thượng',
		photo: {
			url: '/covers/cover-dem-nay-tinh-ruou.jpg',
			text: 'Bìa truyện Đêm Nay Tỉnh Rượu',
			by: 'Đang tiến hành'
		}
	},
];

const CircularGalleryDemo = () => {
  return (
    // This outer container provides the scrollable height
    <div className="w-full bg-background text-foreground" style={{ height: '500vh' }}>
      {/* This inner container sticks to the top while scrolling */}
      <div className="w-full h-screen sticky top-0 flex flex-col items-center justify-center overflow-hidden">
        <div className="text-center mb-8 absolute top-16 z-10">
          <h1 className="text-4xl font-bold">Thư Viện ViCamBachGiai</h1>
          <p className="text-muted-foreground">Cuộn để xoay kệ truyện</p>
        </div>
        <div className="w-full h-full">
          <CircularGallery items={galleryData} />
        </div>
      </div>
    </div>
  );
};

export default CircularGalleryDemo;
