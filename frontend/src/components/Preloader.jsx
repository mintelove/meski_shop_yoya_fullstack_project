import { motion } from "framer-motion";
import logo from "../picture/logo.jpg";

export const Preloader = () => {
  return (
    <div className="preloader-overlay">
      <motion.div 
        className="preloader-container"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="preloader-ring"></div>
        <motion.div
          className="preloader-logo-wrap"
          animate={{ 
            scale: [1, 1.05, 1],
          }}
          transition={{ 
            duration: 2, 
            repeat: Infinity, 
            ease: "easeInOut" 
          }}
        >
          <img src={logo} alt="MaM Logo" className="preloader-logo" />
        </motion.div>
      </motion.div>
    </div>
  );
};
