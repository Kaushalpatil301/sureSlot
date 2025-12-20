import nodemailer from "nodemailer";
import Mailgen from "mailgen";

const sendEmail = async (options) => {
  const mailGenerator = new Mailgen({
    theme: "default",
    product: {
      name: "SureSlot",
      link: process.env.FRONTEND_URL || "http://localhost:5173",
    },
  });

  const emailBody = mailGenerator.generate(options.mailgenContent);

  const transporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_SMTP_HOST,
    port: process.env.MAILTRAP_SMTP_PORT,
    auth: {
      user: process.env.MAILTRAP_SMTP_USER,
      pass: process.env.MAILTRAP_SMTP_PASS,
    },
  });

  const mailOptions = {
    from: process.env.MAILTRAP_SMTP_USER,
    to: options.email,
    subject: options.subject,
    html: emailBody,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("📧 Email sent successfully to:", options.email);
  } catch (error) {
    console.error("❌ Email sending failed:", error.message);
    throw error;
  }
};

export { sendEmail };
