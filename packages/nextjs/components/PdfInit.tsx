"use client";

import { useEffect } from "react";
import { pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
// Ensure text/annotation styles are in the client bundle
import "react-pdf/dist/esm/Page/TextLayer.css";

export const PdfInit = () => {
  useEffect(() => {
    pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
  }, []);
  return null;
};
