import userRoutes from "./routes/userRoutes.js";
import generationRoutes from "./routes/generationRoutes.js";

app.use("/api/user", userRoutes);
app.use("/api/generation", generationRoutes);
