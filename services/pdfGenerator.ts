import { jsPDF } from "jspdf";
import { BookMetadata, PageDefinition, BookDimensions } from "../types";

export const generatePDF = (metadata: BookMetadata, pages: PageDefinition[], dimensions: BookDimensions, coverImage?: string) => {
  // Create a new PDF document with custom dimensions
  const doc = new jsPDF({
    orientation: dimensions.width > dimensions.height ? "landscape" : "portrait",
    unit: dimensions.unit,
    format: [dimensions.width, dimensions.height]
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Calculate margins based on unit (approx 0.5 inch equivalent)
  const margin = dimensions.unit === 'in' ? 0.5 : (dimensions.unit === 'px' ? 48 : 0.5);

  // --- Title Page ---
  // Font sizes need to be adjusted based on unit if using pixels, but jsPDF handles font size in points usually. 
  // If unit is px, 24px font is small. jsPDF default font size is in 'points' regardless of unit, but positioning relies on unit.
  // We'll stick to points for text which is standard, but we need to position things carefully.
  
  // Helper for consistent text positioning ratio
  const yPos = (percent: number) => pageHeight * percent;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  const titleLines = doc.splitTextToSize(metadata.title, pageWidth - (margin * 2));
  doc.text(titleLines, pageWidth / 2, yPos(0.3), { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(16);
  const subLines = doc.splitTextToSize(metadata.subtitle, pageWidth - (margin * 2));
  doc.text(subLines, pageWidth / 2, yPos(0.45), { align: "center" });

  doc.setFontSize(10);
  doc.text("Generated with KDP Kindle Coloring Book Generator", pageWidth / 2, pageHeight - margin, { align: "center" });

  // --- Optional Cover Page in PDF ---
  if (coverImage) {
      doc.addPage();
      doc.addImage(coverImage, "JPEG", 0, 0, pageWidth, pageHeight);
  }

  // --- Content Pages ---
  pages.forEach((page, index) => {
    if (page.status === 'completed' && page.imageUrl) {
      doc.addPage();
      
      const contentWidth = pageWidth - (margin * 2);
      
      // Page Title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(60);
      const titleY = margin + (dimensions.unit === 'in' ? 0.2 : 20);
      doc.text(page.title, pageWidth / 2, titleY, { align: "center" });

      // Calculate Image area
      // Start image below title
      const imageStartY = titleY + (dimensions.unit === 'in' ? 0.3 : 30);
      const availableHeight = pageHeight - (margin * 1.5) - imageStartY; // Space until bottom margin area

      try {
        const imgProps = doc.getImageProperties(page.imageUrl);
        const imgRatio = imgProps.width / imgProps.height;
        
        let printWidth = contentWidth;
        let printHeight = contentWidth / imgRatio;

        if (printHeight > availableHeight) {
            printHeight = availableHeight;
            printWidth = printHeight * imgRatio;
        }

        const x = (pageWidth - printWidth) / 2;
        // Center vertically in available space
        const y = imageStartY + (availableHeight - printHeight) / 2;

        doc.addImage(page.imageUrl, "PNG", x, y, printWidth, printHeight); 
      } catch (e) {
        console.error("Error adding image to PDF", e);
        // Fallback
        doc.addImage(page.imageUrl, "PNG", margin, imageStartY, contentWidth, contentWidth * 1.3);
      }
      
      // Page number
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Page ${index + 1}`, pageWidth / 2, pageHeight - (margin/2), { align: "center" });
    }
  });

  // --- Metadata Sheet ---
  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(0);
  doc.text("Book Metadata (For KDP Upload)", margin, yPos(0.1));
  
  doc.setFontSize(12);
  let cursorY = yPos(0.15);
  const lineHeight = dimensions.unit === 'in' ? 0.3 : 30;
  
  doc.setFont("helvetica", "bold");
  doc.text("Title:", margin, cursorY);
  doc.setFont("helvetica", "normal");
  const metaTitle = doc.splitTextToSize(metadata.title, pageWidth - margin * 2.5);
  doc.text(metaTitle, margin + (dimensions.unit === 'in' ? 1 : 96), cursorY);
  cursorY += (metaTitle.length * lineHeight) + lineHeight;

  doc.setFont("helvetica", "bold");
  doc.text("Subtitle:", margin, cursorY);
  doc.setFont("helvetica", "normal");
  const metaSub = doc.splitTextToSize(metadata.subtitle, pageWidth - margin * 2.5);
  doc.text(metaSub, margin + (dimensions.unit === 'in' ? 1 : 96), cursorY);
  cursorY += (metaSub.length * lineHeight) + lineHeight;

  doc.setFont("helvetica", "bold");
  doc.text("Description:", margin, cursorY);
  doc.setFont("helvetica", "normal");
  const metaDesc = doc.splitTextToSize(metadata.description, pageWidth - margin * 2.5);
  doc.text(metaDesc, margin + (dimensions.unit === 'in' ? 1 : 96), cursorY);
  cursorY += (metaDesc.length * (lineHeight*0.8)) + (lineHeight*1.5);

  doc.setFont("helvetica", "bold");
  doc.text("Keywords:", margin, cursorY);
  doc.setFont("helvetica", "normal");
  metadata.keywords.forEach(kw => {
      cursorY += lineHeight;
      doc.text(`• ${kw}`, margin + (dimensions.unit === 'in' ? 0.5 : 48), cursorY);
  });

  doc.save(`${metadata.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_interior.pdf`);
};