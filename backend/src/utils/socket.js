let ioInstance;

export const setSocketInstance = (io) => {
  ioInstance = io;
};

export const emitStockUpdate = (payload) => {
  if (ioInstance) {
    ioInstance.emit("stock:update", payload);
  }
};
