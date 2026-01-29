import { sendWelcomeEmail } from "../emails/emailHandlers.js";
import { generateToken } from "../lib/utils.js";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import { ENV } from "../lib/env.js";
import cloudinary from "../lib/cloudinary.js";

const normalizeUsername = (username) => username?.trim().toLowerCase();

const isValidUsername = (username) =>
  typeof username === "string" && /^[a-z0-9_]{3,20}$/.test(username);

const generateUsernameSuggestions = (base) => {
  const suggestions = new Set();
  while (suggestions.size < 3) {
    const digits = Math.floor(1000 + Math.random() * 9000);
    suggestions.add(`${base}_${digits}`);
  }
  return Array.from(suggestions);
};

const generateUniqueUsername = async () => {
  for (let i = 0; i < 10; i += 1) {
    const candidate = `user_${Math.floor(1000 + Math.random() * 9000)}`;
    const existing = await User.findOne({ username: candidate }).select("_id");
    if (!existing) return candidate;
  }
  const fallback = `user_${Date.now().toString().slice(-6)}`;
  return fallback;
};

const ensureUsernameForUser = async (user) => {
  if (user.username) return user;
  const generated = await generateUniqueUsername();
  user.username = generated;
  await user.save();
  return user;
};

export const checkUsername = async (req, res) => {
  const rawUsername = req.query.username;
  if (!rawUsername) {
    return res.status(400).json({
      available: false,
      message: "Username is required",
    });
  }

  const normalized = normalizeUsername(rawUsername);
  if (!isValidUsername(normalized)) {
    return res.status(400).json({
      available: false,
      message: "Username must be 3-20 characters and use letters, numbers, or underscores",
    });
  }

  const existing = await User.findOne({ username: normalized }).select("_id");
  if (!existing) {
    return res.status(200).json({ available: true, normalizedUsername: normalized });
  }

  return res.status(200).json({
    available: false,
    normalizedUsername: normalized,
    suggestions: generateUsernameSuggestions(normalized),
    message: "This username is already taken",
  });
};

export const signup = async (req, res) => {
  const { fullName, email, password, username } = req.body;

  try {
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    // check if emailis valid: regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const user = await User.findOne({ email });
    if (user) {
      console.log("Signup failed: email already exists", email);
      return res.status(400).json({ message: "Email already exists" });
    }

    let finalUsername = normalizeUsername(username);
    if (finalUsername) {
      if (!isValidUsername(finalUsername)) {
        return res.status(400).json({
          message:
            "Username must be 3-20 characters and use letters, numbers, or underscores",
        });
      }
      const existingUsername = await User.findOne({
        username: finalUsername,
      }).select("_id");
      if (existingUsername) {
        console.log("Signup failed: username already exists", finalUsername);
        return res.status(400).json({ message: "Username already exists" });
      }
    } else {
      finalUsername = await generateUniqueUsername();
    }

    // 123456 => $dnjasdkasj_?dmsakmk
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      fullName,
      email,
      username: finalUsername,
      password: hashedPassword,
    });

    if (newUser) {
      // before CR:
      // generateToken(newUser._id, res);
      // await newUser.save();

      // after CR:
      // Persist user first, then issue auth cookie
      const savedUser = await newUser.save();
      generateToken(savedUser._id, res);

      res.status(201).json({
        _id: newUser._id,
        fullName: newUser.fullName,
        email: newUser.email,
        username: newUser.username,
        profilePic: newUser.profilePic,
      });

      try {
        await sendWelcomeEmail(
          savedUser.email,
          savedUser.fullName,
          ENV.CLIENT_URL
        );
      } catch (error) {
        console.error("Failed to send welcome email:", error);
      }
    } else {
      res.status(400).json({ message: "Invalid user data" });
    }
  } catch (error) {
    console.log("Error in signup controller:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.log("Login failed: user not found", email);
      return res.status(400).json({ message: "Invalid credentials" });
    }
    // never tell the client which one is incorrect: password or email

    const ensuredUser = await ensureUsernameForUser(user);
    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      console.log("Login failed: invalid password", email);
      return res.status(400).json({ message: "Invalid credentials" });
    }

    generateToken(ensuredUser._id, res);

    res.status(200).json({
      _id: ensuredUser._id,
      fullName: ensuredUser.fullName,
      email: ensuredUser.email,
      username: ensuredUser.username,
      profilePic: ensuredUser.profilePic,
    });
  } catch (error) {
    console.error("Error in login controller:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const logout = (_, res) => {
  res.cookie("jwt", "", { maxAge: 0 });
  res.status(200).json({ message: "Logged out successfully" });
};

export const checkAuth = async (req, res) => {
  try {
    const ensuredUser = await ensureUsernameForUser(req.user);
    res.status(200).json(ensuredUser);
  } catch (error) {
    console.log("Error in checkAuth controller:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { profilePic } = req.body;
    if (!profilePic)
      return res.status(400).json({ message: "Profile pic is required" });

    const userId = req.user._id;

    const uploadResponse = await cloudinary.uploader.upload(profilePic);

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePic: uploadResponse.secure_url },
      { new: true }
    );

    res.status(200).json(updatedUser);
  } catch (error) {
    console.log("Error in update profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
