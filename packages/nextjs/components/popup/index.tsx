"use client";

import React from "react";
import { usePopUp } from "./PopUpContext";

const PopUp: React.FC = () => {
  const { isPoppedUp, children, closePopUp } = usePopUp();

  if (!isPoppedUp) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center items-center bg-black/40 backdrop-blur-sm transition-opacity duration-300 animate-fadeIn"
      onClick={closePopUp}
    >
      <div className="animate-scaleIn inline-block" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
};

export default PopUp;
