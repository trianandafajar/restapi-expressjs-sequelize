import Address from "../models/addressModel.js";
import Contact from "../models/contactModel.js";
import sequelize from "../utils/db.js";
import { dataValid } from "../validation/dataValidation.js";
import { isExists } from "../validation/sanitization.js";

const setContact = async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    let lstError = [];
    let contact = req.body;
    let addresses = [];

    // Ambil Addresses jika ada
    if (isExists(contact.Addresses)) {
      addresses = contact.Addresses;
    }
    delete contact.Addresses;

    // Validasi data contact
    const contactValidation = await dataValid(
      {
        firstName: "required",
      },
      contact
    );
    lstError.push(...contactValidation.message);

    // Validasi masing-masing address
    const validatedAddresses = await Promise.all(
      addresses.map(async (item) => {
        const addressValidation = await dataValid(
          {
            addressType: "required",
            street: "required",
          },
          item
        );
        lstError.push(...addressValidation.message);
        return addressValidation.data;
      })
    );

    // Susun ulang data contact dengan valid
    const preparedContact = {
      ...contactValidation.data,
      userId: req.user.userId,
      Addresses: validatedAddresses,
    };

    // Jika ada error validasi
    if (lstError.length > 0) {
      return res.status(400).json({
        errors: lstError,
        message: "Create Contact failed due to validation errors",
        data: preparedContact,
      });
    }

    // Simpan contact dan address ke database
    const createdContact = await Contact.create(preparedContact, {
      transaction: t,
    });

    const createdAddresses = await Promise.all(
      validatedAddresses.map((item) =>
        Address.create(
          {
            ...item,
            contactId: createdContact.contactId,
          },
          { transaction: t }
        )
      )
    );

    // Jika gagal simpan
    if (!createdContact || !createdAddresses.length) {
      await t.rollback();
      return res.status(400).json({
        errors: ["Failed to create contact or address"],
        message: "Create Contact failed",
        data: preparedContact,
      });
    }

    // Commit transaksi
    await t.commit();
    return res.status(201).json({
      errors: [],
      message: "Contact created successfully",
      data: {
        ...createdContact.dataValues,
        Addresses: createdAddresses,
      },
    });
  } catch (error) {
    await t.rollback();
    next(
      new Error(
        "controllers/contactController.js:setContact - " + error.message
      )
    );
  }
};

export { setContact };
