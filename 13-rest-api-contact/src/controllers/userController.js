import sequelize from "../utils/db.js";
import { dataValid } from "../validation/dataValidation.js";
import { sendMail, sendPassword } from "../utils/sendMail.js";
import User from "../models/userModel.js";
import { Op } from "sequelize";
import { compare } from "../utils/bcrypt.js";
import {
  generateAccessToken,
  generateRefreshToken,
  parseJWT,
  verifyRefreshToken,
} from "../utils/jwt.js";
import { isExists } from "../validation/sanitization.js";
import { Entropy, charset32 } from "entropy-string";

const handleValidationErrors = (res, messages, field) =>
  res.status(400).json({ errors: messages, message: `${field} Field`, data: null });

const setUser = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const valid = {
      name: "required",
      email: "required,isEmail",
      password: "required,isStrongPassword",
      confirmPassword: "required",
    };
    const user = await dataValid(valid, req.body);
    if (user.data.password !== user.data.confirmPassword) {
      user.message.push("Password does not match");
    }
    if (user.message.length > 0) return handleValidationErrors(res, user.message, "Register");

    const userExists = await User.findOne({ where: { email: user.data.email } });

    if (userExists?.isActive) {
      return handleValidationErrors(res, ["Email already activated"], "Register");
    }
    if (userExists && !userExists.isActive && Date.parse(userExists.expireTime) > Date.now()) {
      return handleValidationErrors(res, ["Email already registered, please check your email"], "Register");
    }

    if (userExists) {
      await User.destroy({ where: { email: user.data.email }, transaction: t });
    }

    const newUser = await User.create({ ...user.data, expireTime: new Date() }, { transaction: t });
    const result = await sendMail(newUser.email, newUser.userId);
    if (!result) {
      await t.rollback();
      return res.status(500).json({ errors: ["Send email failed"], message: "Register Field", data: null });
    }

    await t.commit();
    res.status(201).json({
      errors: null,
      message: "User created, please check your email",
      data: {
        userId: newUser.userId,
        name: newUser.name,
        email: newUser.email,
        expireTime: newUser.expireTime.toString(),
      },
    });
  } catch (error) {
    await t.rollback();
    next(new Error("userController:setUser - " + error.message));
  }
};

const setActivateUser = async (req, res, next) => {
  try {
    const user = await User.findOne({
      where: {
        userId: req.params.id,
        isActive: false,
        expireTime: { [Op.gte]: new Date() },
      },
    });
    if (!user) {
      return handleValidationErrors(res, ["User not found or expired"], "Activate User");
    }

    user.isActive = true;
    user.expireTime = null;
    await user.save();

    res.status(200).json({
      errors: [],
      message: "User activated successfully",
      data: { name: user.name, email: user.email },
    });
  } catch (error) {
    next(new Error("userController:setActivateUser - " + error.message));
  }
};

const getUser = async (req, res, next) => {
  try {
    const users = await User.findAll();
    res.status(200).json({ errors: [], message: "Users retrieved", data: users });
  } catch (error) {
    next(new Error("userController:getUser - " + error.message));
  }
};

const setLogin = async (req, res, next) => {
  try {
    const valid = { email: "required,isEmail", password: "required" };
    const user = await dataValid(valid, req.body);

    if (user.message.length > 0) return handleValidationErrors(res, user.message, "Login");

    const userExists = await User.findOne({ where: { email: user.data.email, isActive: true } });

    if (!userExists || !compare(user.data.password, userExists.password)) {
      return handleValidationErrors(res, ["Invalid email or password"], "Login");
    }

    const usr = {
      userId: userExists.userId,
      name: userExists.name,
      email: userExists.email,
    };
    const accessToken = generateAccessToken(usr);
    const refreshToken = generateRefreshToken(usr);

    res.status(200).json({
      errors: [],
      message: "Login successfully",
      data: usr,
      acessToken: accessToken,
      refreshToken,
    });
  } catch (error) {
    next(new Error("userController:setLogin - " + error.message));
  }
};

const setRefreshToken = async (req, res, next) => {
  try {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) return handleValidationErrors(res, ["Refresh token not found"], "Refresh");

    const isValid = verifyRefreshToken(token);
    if (!isValid) return handleValidationErrors(res, ["Invalid refresh token"], "Refresh");

    const payload = parseJWT(token);
    const user = await User.findOne({ where: { email: payload.email, isActive: true } });
    if (!user) return handleValidationErrors(res, ["User not found"], "Refresh");

    const usr = { userId: user.userId, name: user.name, email: user.email };
    res.status(200).json({
      errors: [],
      message: "Refresh successfully",
      data: usr,
      acessToken: generateAccessToken(usr),
      refreshToken: generateRefreshToken(usr),
    });
  } catch (error) {
    next(new Error("userController:setRefreshToken - " + error.message));
  }
};

const updateUser = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const valid = {};
    if (isExists(req.body.name)) valid.name = "required";
    if (isExists(req.body.email)) valid.email = "required,isEmail";
    if (isExists(req.body.password)) {
      valid.password = "required,isStrongPassword";
      valid.conformPassword = "required";
    }

    const user = await dataValid(valid, req.body);
    if (user.data.password && user.data.password !== user.data.conformPassword) {
      user.message.push("Password not match");
    }

    if (user.message.length > 0) return handleValidationErrors(res, user.message, "Update");

    const [updated] = await User.update(user.data, { where: { userId } });
    if (!updated) return res.status(404).json({ errors: ["User not found"], message: "Update Field", data: null });

    res.status(200).json({ errors: [], message: "User updated successfully", data: user.data });
  } catch (error) {
    next(new Error("userController:updateUser - " + error.message));
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const deleted = await User.destroy({ where: { userId: req.params.id } });
    if (!deleted) return res.status(404).json({ errors: ["User not found"], message: "Delete Field", data: null });

    res.status(200).json({ errors: [], message: "User deleted successfully", data: null });
  } catch (error) {
    next(new Error("userController:deleteUser - " + error.message));
  }
};

const forgotPassword = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const valid = { email: "required,isEmail" };
    const result = await dataValid(valid, req.body);
    if (result.message.length > 0) return handleValidationErrors(res, result.message, "Forgot Password");

    const user = await User.findOne({ where: { email: result.data.email } });
    if (!user) return res.status(404).json({ errors: ["User not found"], message: "Forgot Password Field", data: null });

    const newPass = new Entropy({ bits: 60, charset: charset32 }).string();
    await User.update({ password: newPass }, { where: { userId: user.userId }, transaction: t });

    const sent = await sendPassword(user.email, newPass);
    if (!sent) {
      await t.rollback();
      return handleValidationErrors(res, ["Email not sent"], "Forgot Password");
    }

    await t.commit();
    res.status(200).json({ errors: [], message: "Forgot Password success, please check your email", data: null });
  } catch (error) {
    await t.rollback();
    next(new Error("userController:forgotPassword - " + error.message));
  }
};

export {
  setUser,
  setActivateUser,
  getUser,
  setLogin,
  setRefreshToken,
  updateUser,
  deleteUser,
  forgotPassword,
};
