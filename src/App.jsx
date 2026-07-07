import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import * as XLSX from 'xlsx';
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDoc
} from 'firebase/firestore';
import {
  Utensils,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  CheckCircle,
  RefreshCw,
  Eye,
  EyeOff,
  ClipboardList,
  Layers,
  Sparkles,
  Lock,
  Unlock,
  Printer,
  Filter,
  Edit2,
  X,
  Check,
  Download,
  Sun,
  Moon,
  QrCode,
  LogOut
} from 'lucide-react';

import { MASTER_MENU_DATASET } from './menuData';

const MENU_CATEGORIES = [
  'VEG SOUPS',
  'VEG STARTERS',
  'VEG BRIYANI',
  'VEG RICE & NOODELS',
  'VEG CURRIES',
  'NON VEG SOUPS',
  'NON VEG RICE & NOODELS',
  'NON VEG STARTERS',
  'NON VEG BRIYANI',
  'NON VEG CURRIES',
  'NAANS & ROTI',
  'TANDURI & KABA\'S',
  'ONLY TABLE PURPOSE',
  'DRINKS'
];

export default function RestaurantApp() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [currentView, setCurrentView] = useState('customer');
  const [kitchenSubView, setKitchenSubView] = useState('orders');
  const [activeCategory, setActiveCategory] = useState('VEG SOUPS');
  const [activeInventoryCategory, setActiveInventoryCategory] = useState('VEG SOUPS');
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [tableNumber, setTableNumber] = useState('');
  const [isTableLocked, setIsTableLocked] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tableError, setTableError] = useState('');

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [userRole, setUserRole] = useState(null); // 'owner', 'staff', or null
  const pinInputRef = useRef(null);
  const OWNER_PIN = '3579';
  const STAFF_PIN = '1234';

  const [toast, setToast] = useState({ show: false, message: '', actionLabel: null, onAction: null });
  const [activePrintOrder, setActivePrintOrder] = useState(null);
  const [isPrintingQrs, setIsPrintingQrs] = useState(false);
  const [printSingleTableId, setPrintSingleTableId] = useState(null);

  const [menuItems, setMenuItems] = useState(MASTER_MENU_DATASET);
  const [orders, setOrders] = useState([]);
  const [completedOrders, setCompletedOrders] = useState([]);
  const [completedBillsCount, setCompletedBillsCount] = useState(0);
  const [selectedAnalyticsDate, setSelectedAnalyticsDate] = useState(new Date().toLocaleDateString('en-GB'));
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportRangeStart, setExportRangeStart] = useState(new Date().toISOString().slice(0, 10));
  const [exportRangeEnd, setExportRangeEnd] = useState(new Date().toISOString().slice(0, 10));

  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('VEG SOUPS');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [newItemSerial, setNewItemSerial] = useState('');

  // States to track editing inline fields
  const [editingItemId, setEditingItemId] = useState(null);
  const [editName, setEditEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSerial, setEditSerial] = useState('');

  const showToast = (message, actionLabel = null, onAction = null) => {
    setToast({ show: true, message, actionLabel, onAction });
    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => setToast({ show: false, message: '', actionLabel: null, onAction: null }), 6000);
  };

  // Daily reset at 12am (midnight)
  const checkAndResetAtMidnight = async () => {
    try {
      const configRef = doc(db, "system_config", "counters");
      const configSnap = await getDoc(configRef);
      if (!configSnap.exists()) return;

      const data = configSnap.data();
      const lastResetTime = data.lastResetTimestamp || 0;
      const now = Date.now();
      const lastResetDate = data.lastResetDate || '';
      const todayDate = new Date().toLocaleDateString('en-GB');

      // Reset if it's a new calendar day
      if (lastResetDate !== todayDate) {
        await setDoc(configRef, {
          billNo: 1,
          tokenNo: 1,
          completedBillsCount: 0,
          lastResetDate: todayDate,
          lastResetTimestamp: now
        });
      }
    } catch (err) {
      console.error('Midnight reset check error:', err);
    }
  };

  useEffect(() => {
    if (isAuthModalOpen) {
      const timeoutId = window.setTimeout(() => {
        if (pinInputRef.current) {
          pinInputRef.current.focus();
          pinInputRef.current.select();
        }
      }, 50);
      return () => window.clearTimeout(timeoutId);
    }
    return undefined;
  }, [isAuthModalOpen]);

  // Check for daily reset at midnight every minute
  useEffect(() => {
    checkAndResetAtMidnight(); // Check on app load
    const interval = setInterval(checkAndResetAtMidnight, 60000); // Check every 60 seconds
    return () => clearInterval(interval);
  }, []);

  // Parse table parameter from URL query string on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tableParam = params.get('table');
    if (tableParam) {
      if (tableParam.toLowerCase() === 'parcel') {
        setCurrentView('parcel');
      } else {
        const tblNum = parseInt(tableParam, 10);
        if (!isNaN(tblNum) && tblNum >= 1 && tblNum <= 10) {
          setTableNumber(tableParam);
          setIsTableLocked(true);
          setCurrentView('customer');
        } else {
          showToast('⚠️ Invalid table number in URL (must be between 1 and 10).');
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!db) return;

    const unsubscribeMenu = onSnapshot(collection(db, "menu_items"), (snapshot) => {
      if (!snapshot.empty) {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setMenuItems(items);
      } else {
        MASTER_MENU_DATASET.forEach((item) => {
          setDoc(doc(db, "menu_items", item.id), { ...item, isAvailable: true });
        });
        setMenuItems(MASTER_MENU_DATASET);
      }
    });

    const unsubscribeOrders = onSnapshot(collection(db, "orders"), (snapshot) => {
      const liveOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOrders(liveOrders);
    });

    const unsubscribeCompletedOrders = onSnapshot(collection(db, "completed_orders"), (snapshot) => {
      const completed = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCompletedOrders(completed);
    });

    const unsubscribeCounters = onSnapshot(doc(db, "system_config", "counters"), (snapshot) => {
      if (snapshot.exists()) {
        setCompletedBillsCount(snapshot.data().completedBillsCount || 0);
      } else {
        setDoc(doc(db, "system_config", "counters"), { billNo: 1, tokenNo: 1, completedBillsCount: 0, lastOrderDate: "" });
      }
    });

    return () => {
      unsubscribeMenu();
      unsubscribeOrders();
      unsubscribeCompletedOrders();
      unsubscribeCounters();
    };
  }, []);

  const toggleItemAvailability = async (itemId) => {
    const itemRef = doc(db, "menu_items", itemId);
    const targetItem = menuItems.find(i => i.id === itemId);
    if (targetItem) {
      await updateDoc(itemRef, { isAvailable: !targetItem.isAvailable });
      showToast(`Updated ${targetItem.name} status.`);
    }
  };

  const startEditingItem = (item) => {
    setEditingItemId(item.id);
    setEditEditName(item.name);
    setEditPrice(item.price);
    setEditDescription(item.description || '');
    setEditSerial(item.serial || '');
  };

  const handleUpdateItem = async (itemId) => {
    if (!editName.trim() || !editPrice) return;
    try {
      const itemRef = doc(db, "menu_items", itemId);
      await updateDoc(itemRef, {
        name: editName.toUpperCase(),
        price: Number(editPrice),
        description: editDescription,
        serial: editSerial.trim()
      });
      setEditingItemId(null);
      showToast("📝 Item updated successfully!");
    } catch (err) {
      alert("Update error: " + err.message);
    }
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!newItemName.trim() || !newItemPrice) return;

    const newId = `custom-${Date.now()}`;
    await setDoc(doc(db, "menu_items", newId), {
      id: newId,
      name: newItemName.toUpperCase(),
      price: Number(newItemPrice),
      category: newItemCategory,
      description: newItemDescription || 'Freshly prepared specialty.',
      serial: newItemSerial.trim(),
      isAvailable: true
    });

    showToast(`🎁 Added ${newItemName.toUpperCase()}!`);
    setNewItemName(''); setNewItemPrice(''); setNewItemDescription(''); setNewItemSerial('');
    setIsAddFormOpen(false);
  };

  const handleRemoveItem = async (itemId, itemName) => {
    if (window.confirm(`Permanently delete "${itemName}"?`)) {
      await deleteDoc(doc(db, "menu_items", itemId));
      showToast(`🗑️ Removed ${itemName}`);
    }
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    const isParcelOrder = currentView === 'parcel';
    if (!isParcelOrder) {
      if (!tableNumber.trim()) {
        return alert('Please enter your Table Number.');
      }
      const tblNum = parseInt(tableNumber, 10);
      if (isNaN(tblNum) || tblNum < 1 || tblNum > 10) {
        return alert('Please enter a valid Table Number between 1 and 10.');
      }
    }
    if (cart.length === 0) return;

    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-GB');
    const formattedTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    const configRef = doc(db, "system_config", "counters");
    const configSnap = await getDoc(configRef);
    let { billNo, tokenNo, lastResetDate, completedBillsCount: totalDone } = configSnap.data() || { billNo: 1, tokenNo: 1, completedBillsCount: 0, lastResetDate: "" };

    // Reset counters if it's a new calendar day (past midnight)
    if (lastResetDate !== "" && lastResetDate !== formattedDate) {
      billNo = 1;
      tokenNo = 1;
      totalDone = 0;
    }

    const assignedBill = billNo;
    const assignedToken = tokenNo;

    await addDoc(collection(db, "orders"), {
      billNo: assignedBill.toString(),
      tokenNo: assignedToken.toString(),
      tableNumber: isParcelOrder ? 'PARCEL' : tableNumber,
      isParcel: isParcelOrder,
      date: formattedDate,
      time: formattedTime,
      items: cart.map(item => ({ name: item.name, quantity: item.quantity, price: item.price }))
    });

    await setDoc(configRef, {
      billNo: assignedBill + 1,
      tokenNo: assignedToken + 1,
      completedBillsCount: totalDone,
      lastResetDate: formattedDate,
      lastResetTimestamp: Date.now()
    });

    setCart([]);
    if (!isTableLocked) {
      setTableNumber('');
    }
    setIsCartOpen(false);
    showToast(isParcelOrder ? '🎉 Parcel order sent!' : `🎉 Order sent! Table ${tableNumber}`);
  };

  const getItemSerial = (item) => {
    if (item.serial && `${item.serial}`.trim() !== '') {
      return `${item.serial}`.trim();
    }
    const masterIndex = MASTER_MENU_DATASET.findIndex((masterItem) => masterItem.id === item.id);
    if (masterIndex >= 0) {
      return `${masterIndex + 1}`;
    }
    const fallbackIndex = menuItems.findIndex((menuItem) => menuItem.id === item.id);
    return fallbackIndex >= 0 ? `${fallbackIndex + 1}` : '';
  };

  const filteredMenuItems = (() => {
    const searchValue = searchQuery.trim().toLowerCase();
    const isNumericSearch = /^[0-9]+$/.test(searchValue);
    return menuItems.filter((item) => {
      if (!item.isAvailable) return false;
      if (searchValue === '') return item.category === activeCategory;
      const serialLabel = getItemSerial(item);
      if (isNumericSearch) {
        return serialLabel.toLowerCase() === searchValue;
      }
      const combined = `${serialLabel} ${item.name} ${item.category} ${item.description || ''}`.toLowerCase();
      return combined.includes(searchValue);
    });
  })();

  const markOrderDone = async (orderId) => {
    try {
      const orderRef = doc(db, "orders", orderId);
      const orderSnap = await getDoc(orderRef);

      if (orderSnap.exists()) {
        // Save to completed_orders collection
        await addDoc(collection(db, "completed_orders"), {
          ...orderSnap.data(),
          completedAt: new Date().toISOString()
        });
      }

      // Delete from active orders
      await deleteDoc(orderRef);

      const configRef = doc(db, "system_config", "counters");
      const configSnap = await getDoc(configRef);
      const currentTally = configSnap.data()?.completedBillsCount || 0;

      await updateDoc(configRef, { completedBillsCount: currentTally + 1 });
      showToast('Order completed.');
    } catch (err) {
      alert('Error marking order as done: ' + err.message);
    }
  };

  const deleteActiveOrder = async (orderId) => {
    if (window.confirm("Are you sure you want to delete this order? It will be removed permanently.")) {
      try {
        await deleteDoc(doc(db, "orders", orderId));
        showToast('Order deleted.');
      } catch (err) {
        alert('Error deleting order: ' + err.message);
      }
    }
  };

  const handleResetCounters = async () => {
    if (window.confirm("Reset Completed Bills count to 0?")) {
      await setDoc(doc(db, "system_config", "counters"), {
        billNo: 1,
        tokenNo: 1,
        completedBillsCount: 0,
        lastOrderDate: new Date().toLocaleDateString('en-GB')
      });
      showToast("🔄 Daily tallies reset!");
    }
  };

  const handleResetExportRange = () => {
    const todayValue = new Date().toISOString().slice(0, 10);
    setExportRangeStart(todayValue);
    setExportRangeEnd(todayValue);
    showToast('Export range reset');
  };

  const formatInputToLabel = (input) => {
    const [year, month, day] = input.split('-');
    return `${day}/${month}/${year}`;
  };

  const parseDateLabel = (label) => {
    const [day, month, year] = label.split('/');
    return new Date(`${year}-${month}-${day}T00:00:00`);
  };

  const openExportModal = () => {
    setIsExportModalOpen(true);
  };

  const handleExportSalesReport = () => {
    const startLabel = formatInputToLabel(exportRangeStart);
    const endLabel = formatInputToLabel(exportRangeEnd);
    const startDate = parseDateLabel(startLabel);
    const endDate = parseDateLabel(endLabel);

    if (startDate > endDate) {
      alert('Start date cannot be after end date.');
      return;
    }

    const datesToExport = Array.from(
      new Set(
        completedOrders
          .map((order) => order.date)
          .filter((dateLabel) => {
            const orderDate = parseDateLabel(dateLabel);
            return orderDate >= startDate && orderDate <= endDate;
          })
      )
    ).sort((a, b) => parseDateLabel(a) - parseDateLabel(b));

    if (datesToExport.length === 0) {
      alert('No completed orders in the selected date range.');
      return;
    }

    const wb = XLSX.utils.book_new();
    let exportedSheetCount = 0;

    datesToExport.forEach((dateLabel) => {
      const filteredOrders = completedOrders.filter(order => order.date === dateLabel);
      const itemStats = {};

      menuItems.forEach((item) => {
        itemStats[item.name] = {
          itemName: item.name,
          category: item.category,
          price: item.price,
          totalQty: 0,
          totalRevenue: 0
        };
      });

      filteredOrders.forEach((order) => {
        order.items?.forEach((orderItem) => {
          if (itemStats[orderItem.name]) {
            itemStats[orderItem.name].totalQty += orderItem.quantity;
            itemStats[orderItem.name].totalRevenue += orderItem.quantity * orderItem.price;
          }
        });
      });

      const reportData = Object.values(itemStats)
        .filter(item => item.totalQty > 0)
        .sort((a, b) => b.totalQty - a.totalQty);

      const wsData = [
        ['HARSHA RESTAURANT - SALES REPORT'],
        [`Date: ${dateLabel}`],
        ['Generated on: ' + new Date().toLocaleString('en-GB')],
        [],
        ['Item Name', 'Category', 'Price (₹)', 'Total Qty Sold', 'Total Revenue (₹)']
      ];

      if (reportData.length === 0) {
        wsData.push(['No completed orders for this date.']);
      } else {
        reportData.forEach((item) => {
          wsData.push([
            item.itemName,
            item.category,
            item.price.toFixed(2),
            item.totalQty,
            item.totalRevenue.toFixed(2)
          ]);
        });

        wsData.push([]);
        const totalQty = reportData.reduce((sum, item) => sum + item.totalQty, 0);
        const totalRevenue = reportData.reduce((sum, item) => sum + item.totalRevenue, 0);
        wsData.push(['TOTAL', '', '', totalQty, totalRevenue.toFixed(2)]);
      }

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [
        { wch: 25 },
        { wch: 15 },
        { wch: 12 },
        { wch: 15 },
        { wch: 18 }
      ];

      const safeSheetName = `Sales_${dateLabel.replace(/\//g, '-')}`.slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
      exportedSheetCount += 1;
    });

    const fileName = `harsha_sales_report_${datesToExport[0].replace(/\//g, '-')}_to_${datesToExport[datesToExport.length - 1].replace(/\//g, '-')}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast(`📊 Exported ${exportedSheetCount} worksheet${exportedSheetCount === 1 ? '' : 's'} successfully!`);
    setIsExportModalOpen(false);
  };

  const getAnalyticsData = () => {
    const itemStats = {};

    menuItems.forEach((item) => {
      itemStats[item.name] = {
        itemName: item.name,
        category: item.category,
        price: item.price,
        totalQty: 0,
        totalRevenue: 0
      };
    });

    const filteredOrders = completedOrders.filter(order => order.date === selectedAnalyticsDate);

    filteredOrders.forEach((order) => {
      order.items?.forEach((orderItem) => {
        if (itemStats[orderItem.name]) {
          itemStats[orderItem.name].totalQty += orderItem.quantity;
          itemStats[orderItem.name].totalRevenue += orderItem.quantity * orderItem.price;
        }
      });
    });

    return Object.values(itemStats)
      .filter(item => item.totalQty > 0)
      .sort((a, b) => b.totalQty - a.totalQty);
  };

  const handleDeleteAnalyticsItem = async (itemName) => {
    if (!window.confirm(`Delete analytics records for "${itemName}" on ${selectedAnalyticsDate}?`)) return;

    const ordersToUpdate = completedOrders.filter(
      (order) => order.date === selectedAnalyticsDate && order.items?.some((it) => it.name === itemName)
    );

    try {
      for (const order of ordersToUpdate) {
        const updatedItems = order.items.filter((it) => it.name !== itemName);
        const orderRef = doc(db, 'completed_orders', order.id);

        if (updatedItems.length === 0) {
          await deleteDoc(orderRef);
        } else {
          await updateDoc(orderRef, { items: updatedItems });
        }
      }
      showToast(`Deleted ${itemName} from analytics.`);
    } catch (err) {
      alert('Failed to delete analytics item: ' + err.message);
    }
  };

  const addToCart = (item) => {
    setCart((prevCart) => {
      const existing = prevCart.find((cartItem) => cartItem.id === item.id);
      if (existing) {
        return prevCart.map((cartItem) =>
          cartItem.id === item.id ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem
        );
      }
      return [...prevCart, { ...item, quantity: 1 }];
    });
    showToast(`Added ${item.name}`, 'Go to Cart', () => setIsCartOpen(true));
  };

  const updateQuantity = (id, change) => {
    setCart((prevCart) =>
      prevCart
        .map((item) => {
          if (item.id === id) {
            const nextQty = item.quantity + change;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter(Boolean)
    );
  };

  const removeFromCart = (id) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== id));
  };

  const cartTotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const totalItemsCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  const handlePrint = (order) => {
    setActivePrintOrder(order);
    setTimeout(() => {
      window.print();
      markOrderDone(order.id);
    }, 300);
  };

  const handlePrintQrs = () => {
    setIsPrintingQrs(true);
    setTimeout(() => {
      window.print();
      setIsPrintingQrs(false);
    }, 300);
  };

  const handlePrintSingleQr = (tableId) => {
    setPrintSingleTableId(tableId);
    setTimeout(() => {
      window.print();
      setPrintSingleTableId(null);
    }, 300);
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredMenuItems.length > 0) {
        addToCart(filteredMenuItems[0]);
        setSearchQuery('');
      }
    }
  };

  const handleKdsViewToggle = () => {
    if (userRole) {
      setCurrentView('kitchen');
    } else {
      setIsAuthModalOpen(true);
    }
  };

  const handleVerifyPin = (e) => {
    e.preventDefault();
    if (pinInput === OWNER_PIN) {
      setUserRole('owner');
      setIsAuthModalOpen(false);
      setPinInput('');
      setCurrentView('kitchen');
      setKitchenSubView('orders');
      showToast('🔒 Unlocked KDS as Owner');
    } else if (pinInput === STAFF_PIN) {
      setUserRole('staff');
      setIsAuthModalOpen(false);
      setPinInput('');
      setCurrentView('kitchen');
      setKitchenSubView('orders');
      showToast('🔒 Unlocked KDS as Staff');
    } else {
      alert('Incorrect PIN!');
      setPinInput('');
    }
  };

  return (
    <div className={`min-h-screen font-sans flex flex-col relative transition-colors duration-500 overflow-hidden ${isDarkMode
      ? 'bg-[#070913] text-slate-100 selection:bg-emerald-800'
      : 'bg-[#f6f8fb] text-slate-800 selection:bg-emerald-100'
      }`}>

      {/* Premium ambient glow background blobs */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className={`absolute top-[-10%] left-[-10%] w-[350px] sm:w-[500px] h-[350px] sm:h-[500px] rounded-full blur-[80px] sm:blur-[120px] transition-all duration-700 ${isDarkMode ? 'bg-emerald-500/5' : 'bg-emerald-500/8'
          }`} />
        <div className={`absolute bottom-[-10%] right-[-10%] w-[350px] sm:w-[500px] h-[350px] sm:h-[500px] rounded-full blur-[80px] sm:blur-[120px] transition-all duration-700 ${isDarkMode ? 'bg-indigo-500/5' : 'bg-indigo-500/8'
          }`} />
      </div>


      <style>{`
        /* Hide scrollbar for Chrome, Safari and Opera */
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        /* Hide scrollbar for IE, Edge and Firefox */
        .scrollbar-hide {
          -ms-overflow-style: none;  /* IE and Edge */
          scrollbar-width: none;  /* Firefox */
        }

        @media print {
          ${(isPrintingQrs || printSingleTableId !== null) ? `
            @page { size: auto; margin: 15mm; }
            html, body { background: #fff !important; color: #000 !important; }
            body * { visibility: hidden !important; }
            #harsha-qr-print, #harsha-qr-print * { visibility: visible !important; }
            #harsha-qr-print {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              visibility: visible !important;
            }
          ` : `
            @page { size: 80mm auto; margin: 0; }
            html, body { margin: 0; padding: 0; }
            body * { visibility: hidden !important; }
            #harsha-thermal-receipt, #harsha-thermal-receipt * { 
               visibility: visible !important; 
               font-weight: bold !important;
             }
            #harsha-thermal-receipt {
              position: absolute;
              left: 0;
              top: 0;
              width: 100% !important;
              max-width: 80mm;
              min-height: 100%;
              box-sizing: border-box;
              font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif;
              font-size: 12px;
              color: #000;
              background: #fff;
              padding: 2mm 1mm;
              font-weight: bold;
              line-height: 1.3;
              word-wrap: break-word;
              text-align: center;
            }
            #harsha-thermal-receipt * { box-sizing: border-box; }
            #harsha-thermal-receipt table { width: 100%; max-width: 100%; border-collapse: collapse; margin: 0 auto; }
            #harsha-thermal-receipt td, #harsha-thermal-receipt th {
              padding: 3px 0;
              font-weight: bold !important;
              vertical-align: top;
            }
            #harsha-thermal-receipt th { text-align: left; }
            #harsha-thermal-receipt th:last-child,
            #harsha-thermal-receipt td:last-child { text-align: right; }
            #harsha-thermal-receipt thead tr,
            #harsha-thermal-receipt tfoot tr { border-bottom: 1px dashed #000; }
            #harsha-thermal-receipt tr { page-break-inside: avoid; }
            #harsha-thermal-receipt .item-name { display: inline-block; max-width: 33mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left; }
            #harsha-thermal-receipt .item-qty { width: 10mm; text-align: center; }
            #harsha-thermal-receipt .item-price,
            #harsha-thermal-receipt .item-amount { width: 15mm; text-align: right; }
            #harsha-thermal-receipt .receipt-header { font-size: 15px; }
            #harsha-thermal-receipt .receipt-small { font-size: 10px; }
            #harsha-thermal-receipt .section-divider { margin: 4px 0; border-bottom: 1px dashed #000; }
          `}
        }
      `}</style>

      {toast.show && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl shadow-2xl border border-slate-800 bg-slate-900 text-white print:hidden flex items-center gap-4 transition-all duration-300 backdrop-blur-md shadow-slate-950/40">
          <span className="font-extrabold text-xs tracking-wide text-slate-100">{toast.message}</span>
          {toast.actionLabel && toast.onAction && (
            <button
              onClick={() => {
                toast.onAction();
                setToast({ show: false, message: '', actionLabel: null, onAction: null });
              }}
              className="text-[10px] font-black uppercase bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3.5 py-1.5 rounded-xl shadow-sm transition-all duration-200 cursor-pointer active:scale-[0.97]"
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}

      <header className={`sticky top-0 z-40 border-b backdrop-blur-xl print:hidden transition-all duration-500 ${isDarkMode
        ? 'bg-[#070913]/75 border-white/[0.05] shadow-lg shadow-slate-950/20'
        : 'bg-white/75 border-slate-200/50 shadow-sm shadow-slate-100/5'
        }`}>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="Harsha Restaurant Logo"
              className="w-8 h-8 sm:w-11 sm:h-11 object-contain rounded-full shadow-md"
            />
            <div>
              <h1 className={`text-sm sm:text-xl font-extrabold tracking-tight transition-colors duration-300 flex items-center gap-1.5 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Harsha Restaurant
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-3">
            <button
              onClick={() => { setCurrentView('customer'); setUserRole(null); setSearchQuery(''); }}
              className={`px-2 py-1.5 sm:px-4 sm:py-2 rounded-md sm:rounded-lg text-[10px] sm:text-sm font-semibold transition-all duration-250 ${currentView === 'customer'
                ? isDarkMode
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : isDarkMode
                  ? 'text-slate-400 hover:bg-slate-900/60 hover:text-white border border-transparent'
                  : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                }`}
            >
              Menu
            </button>
            <button
              onClick={() => { setCurrentView('parcel'); setUserRole(null); setSearchQuery(''); }}
              className={`px-2 py-1.5 sm:px-4 sm:py-2 rounded-md sm:rounded-lg text-[10px] sm:text-sm font-semibold transition-all duration-250 ${currentView === 'parcel'
                ? isDarkMode
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : isDarkMode
                  ? 'text-slate-400 hover:bg-slate-900/60 hover:text-white border border-transparent'
                  : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                }`}
            >
              Parcel
            </button>
            <button
              onClick={handleKdsViewToggle}
              className={`px-2 py-1.5 sm:px-4 sm:py-2 rounded-md sm:rounded-lg text-[10px] sm:text-sm font-semibold transition-all relative flex items-center gap-1 sm:gap-1.5 duration-250 ${currentView === 'kitchen'
                ? isDarkMode
                  ? 'bg-amber-500/15 text-amber-450 border border-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
                : isDarkMode
                  ? 'text-slate-400 hover:bg-slate-900/60 hover:text-white border border-transparent'
                  : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                }`}
            >
              {userRole ? <Unlock size={11} className="text-emerald-500" /> : <Lock size={11} className={isDarkMode ? 'text-slate-500' : 'text-slate-400'} />}
              <span>KDS {userRole && `(${userRole === 'owner' ? 'Owner' : 'Staff'})`}</span>
              {orders.length > 0 && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-500 text-white text-[8px] font-black rounded-full flex items-center justify-center animate-pulse">{orders.length}</span>}
            </button>

            {userRole && (
              <button
                onClick={() => { setCurrentView('customer'); setUserRole(null); setSearchQuery(''); }}
                className={`px-2 py-1.5 sm:px-3 sm:py-2 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-bold transition-all relative flex items-center gap-1 duration-250 ${isDarkMode
                  ? 'bg-rose-500/15 text-rose-450 border border-rose-500/30 hover:bg-rose-500/25 shadow-[0_0_12px_rgba(244,63,94,0.1)]'
                  : 'bg-rose-50 text-rose-750 border border-rose-200 hover:bg-rose-100'
                  }`}
              >
                <LogOut size={12} />
                <span>Log Out</span>
              </button>
            )}





            {currentView !== 'kitchen' && (
              <button
                onClick={() => setIsCartOpen(true)}
                className={`w-8 h-8 sm:w-11 sm:h-11 rounded-lg flex items-center justify-center relative shadow-md transition-all duration-250 ${isDarkMode
                  ? 'bg-slate-900 border border-slate-850 text-white hover:border-slate-700 shadow-slate-950/20'
                  : 'bg-slate-900 text-white hover:bg-slate-850'
                  }`}
              >
                <ShoppingBag size={15} />
                {totalItemsCount > 0 && <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[9px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center animate-bounce">{totalItemsCount}</span>}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 print:hidden">
        {(currentView === 'customer' || currentView === 'parcel') && (
          <div>
            <div className={`rounded-2xl p-6 sm:p-10 text-white shadow-xl mb-6 sm:mb-8 relative overflow-hidden border transition-all duration-500 ${isDarkMode
              ? 'bg-gradient-to-r from-emerald-950/70 via-slate-900/70 to-slate-950/70 border-white/[0.05] shadow-emerald-950/5'
              : 'bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 border-transparent shadow-lg shadow-emerald-950/10'
              }`}>
              <div className="relative z-10 max-w-lg">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] sm:text-[10px] font-bold mb-3 tracking-wider border uppercase transition-colors duration-300 ${isDarkMode
                  ? 'bg-emerald-500/10 text-emerald-450 border-emerald-500/20'
                  : 'bg-white/10 text-emerald-250 border-white/20'
                  }`}><Sparkles size={10} /> Harsha Family Specials</span>
                <h2 className="text-xl sm:text-4xl font-extrabold tracking-tight leading-tight">Delicious Food, <br className="sm:hidden" />Instant Ordering</h2>
                <p className={`mt-3 text-xs sm:text-sm leading-relaxed ${isDarkMode ? 'text-slate-350' : 'text-emerald-100/90'}`}>{currentView === 'parcel' ? 'Parcel ordering does not require a table number. Search items and send directly to kitchen.' : 'Select a table and order quickly from the menu.'}</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="flex gap-2 overflow-x-auto pb-3 sm:pb-0 scrollbar-hide">
                {MENU_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-4 py-2 rounded-full font-bold text-xs transition-all duration-300 whitespace-nowrap uppercase border tracking-wider ${activeCategory === cat
                      ? isDarkMode
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)] hover:bg-emerald-400'
                        : 'bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-500/20 hover:bg-emerald-600'
                      : isDarkMode
                        ? 'bg-slate-900/50 text-slate-400 border-white/[0.04] hover:bg-slate-850 hover:text-white'
                        : 'bg-white text-slate-650 border-slate-200/80 hover:bg-slate-50 hover:text-slate-800 hover:shadow-xs'
                      }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="flex-1 min-w-[220px]">
                <label className="sr-only">Search Items</label>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={currentView === 'parcel' ? "Search parcel items..." : "Search menu items..."}
                  className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold shadow-inner focus:outline-none focus:ring-2 transition-all ${isDarkMode
                    ? 'bg-slate-900/60 border border-slate-850 text-white placeholder-slate-500 focus:ring-emerald-500/50 focus:border-emerald-500'
                    : 'bg-white border-slate-200 text-slate-850 placeholder-slate-400 focus:ring-emerald-500 focus:border-emerald-500'
                    }`}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredMenuItems.map((item) => {
                const cartItem = cart.find(c => c.id === item.id);
                const serialLabel = `#${getItemSerial(item)}`;

                // Helper to check for Veg/Non-Veg categories
                const categoryLower = item.category.toLowerCase();
                const isVegCategory = categoryLower.includes('veg');
                const isVeg = isVegCategory && !categoryLower.includes('non veg');
                const isNonVeg = categoryLower.includes('non veg');

                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl p-4 border transition-all duration-300 hover:-translate-y-1 flex justify-between items-center gap-4 ${isDarkMode
                      ? 'bg-slate-900/40 border-white/[0.04] shadow-md hover:border-emerald-500/20 hover:shadow-[0_0_20px_rgba(16,185,129,0.08)]'
                      : 'bg-white border-slate-200/60 shadow-sm hover:border-emerald-550/25 hover:shadow-md hover:shadow-slate-100/30'
                      }`}
                  >
                    <div className="min-w-0 flex-grow">
                      <span className="block text-[9px] font-extrabold uppercase tracking-[0.24em] text-slate-400 mb-1.5">Serial {serialLabel}</span>
                      <div className="flex items-center gap-2">
                        {/* Veg / Non-Veg Indicator Dot */}
                        {(isVeg || isNonVeg) && (
                          isVeg ? (
                            <div className="w-3.5 h-3.5 border border-emerald-500/70 flex items-center justify-center rounded shrink-0 p-[2px]" title="Vegetarian">
                              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                            </div>
                          ) : (
                            <div className="w-3.5 h-3.5 border border-rose-500/70 flex items-center justify-center rounded shrink-0 p-[2px]" title="Non-Vegetarian">
                              <div className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
                            </div>
                          )
                        )}
                        <h3 className={`font-extrabold text-base uppercase truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{item.name}</h3>
                        <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded shrink-0 uppercase tracking-wider ${isDarkMode
                          ? 'bg-slate-800/60 text-slate-350'
                          : 'bg-slate-100 text-slate-500'
                          }`}>{item.category}</span>
                      </div>
                      <p className="text-slate-400 text-xs leading-relaxed mt-1.5 line-clamp-2">{item.description || 'Prepared fresh with selected local ingredients.'}</p>
                      <span className={`font-black text-sm block mt-2.5 ${isDarkMode ? 'text-emerald-450' : 'text-emerald-600'}`}>₹{item.price}</span>
                    </div>
                    <div className="shrink-0">
                      {cartItem ? (
                        <div className={`flex items-center rounded-xl p-1 gap-2.5 border transition-all duration-300 ${isDarkMode
                          ? 'bg-emerald-500/10 border-emerald-500/25'
                          : 'bg-emerald-50 border border-emerald-200/80 shadow-xs'
                          }`}>
                          <button
                            onClick={() => updateQuantity(item.id, -1)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center border font-bold transition-all duration-200 ${isDarkMode
                              ? 'bg-slate-950 text-emerald-400 border-slate-850 hover:bg-slate-900'
                              : 'bg-white text-emerald-650 border-emerald-100/80 hover:bg-slate-50 hover:shadow-xs'
                              }`}
                          >
                            <Minus size={13} />
                          </button>
                          <span className={`font-black text-sm min-w-[14px] text-center font-mono ${isDarkMode ? 'text-emerald-400' : 'text-emerald-850'}`}>{cartItem.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, 1)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center border font-bold transition-all duration-200 ${isDarkMode
                              ? 'bg-slate-950 text-emerald-400 border-slate-850 hover:bg-slate-900'
                              : 'bg-white text-emerald-650 border-emerald-100/80 hover:bg-slate-50 hover:shadow-xs'
                              }`}
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(item)}
                          className={`text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1 transition-all duration-300 hover:scale-[1.03] ${isDarkMode
                            ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-550/15'
                            : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm shadow-emerald-500/10'
                            }`}
                        >
                          <Plus size={13} /> Add
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {currentView === 'kitchen' && userRole && (
          <div>
            {userRole === 'owner' && (
              <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 border-b pb-4 transition-colors ${isDarkMode ? 'border-slate-900' : 'border-slate-200'}`}>
                <div className={`flex items-center gap-2 p-1 rounded-xl shadow-xs flex-wrap border transition-all duration-300 ${isDarkMode
                  ? 'bg-slate-900/60 border-slate-850'
                  : 'bg-white border-slate-200'
                  }`}>
                  <button
                    onClick={() => setKitchenSubView('orders')}
                    className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all duration-200 ${kitchenSubView === 'orders'
                      ? 'bg-slate-800 text-white shadow-sm'
                      : isDarkMode
                        ? 'text-slate-400 hover:bg-slate-850 hover:text-white'
                        : 'text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    <ClipboardList size={14} /> Live Orders ({orders.length})
                  </button>
                  <button
                    onClick={() => setKitchenSubView('analytics')}
                    className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all duration-200 ${kitchenSubView === 'analytics'
                      ? isDarkMode
                        ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.25)]'
                        : 'bg-blue-600 text-white shadow-sm'
                      : isDarkMode
                        ? 'text-slate-400 hover:bg-slate-850 hover:text-white'
                        : 'text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    <Download size={14} /> Sales Analytics
                  </button>
                  <button
                    onClick={() => setKitchenSubView('inventory')}
                    className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all duration-200 ${kitchenSubView === 'inventory'
                      ? 'bg-slate-800 text-white shadow-sm'
                      : isDarkMode
                        ? 'text-slate-400 hover:bg-slate-850 hover:text-white'
                        : 'text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    <Layers size={14} /> Configuration Setup
                  </button>
                  <button
                    onClick={() => setKitchenSubView('qrcodes')}
                    className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all duration-200 ${kitchenSubView === 'qrcodes'
                      ? 'bg-slate-800 text-white shadow-sm'
                      : isDarkMode
                        ? 'text-slate-400 hover:bg-slate-850 hover:text-white'
                        : 'text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    <QrCode size={14} /> Table QR Codes
                  </button>
                </div>
                {kitchenSubView === 'orders' && (
                  <button
                    onClick={handleResetCounters}
                    className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 font-semibold transition-all duration-200 border ${isDarkMode
                      ? 'bg-rose-500/10 text-rose-450 border-rose-500/25 hover:bg-rose-500/20'
                      : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                      }`}
                  >
                    <RefreshCw size={13} /> Reset Counter
                  </button>
                )}
              </div>
            )}

            {kitchenSubView === 'orders' && (
              <div>
                <div className="mb-4">
                  <h2 className={`text-base sm:text-2xl font-extrabold tracking-tight uppercase flex items-center gap-2 flex-wrap ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    <span>Kitchen Live Monitor</span>
                    <span className={`text-[10px] normal-case tracking-normal font-bold px-2 py-0.5 rounded-md border ${userRole === 'owner'
                      ? 'bg-emerald-500/10 text-emerald-450 border-emerald-500/20'
                      : 'bg-blue-500/10 text-blue-450 border-blue-500/20'
                      }`}>
                      {userRole === 'owner' ? 'Owner Profile' : 'Staff Profile'}
                    </span>
                  </h2>
                  <div className={`text-xs mt-0.5 font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Total Bills Completed Today &rarr; <span className={`font-bold font-mono px-2 py-0.5 rounded-md border ${isDarkMode
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                      : 'bg-emerald-100 text-emerald-800 border-transparent'
                      }`}>{completedBillsCount}</span>
                  </div>
                </div>
                {orders.length === 0 ? (
                  <div className={`rounded-xl border-2 border-dashed p-16 text-center max-w-sm mx-auto my-12 transition-colors ${isDarkMode ? 'border-slate-800 bg-slate-900/10' : 'border-slate-200 bg-white'
                    }`}>
                    <p className={`font-medium text-sm ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>Waiting for incoming tickets...</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {orders.map((order) => (
                      <div
                        key={order.id}
                        className={`rounded-xl border shadow-md flex flex-col overflow-hidden transition-colors ${isDarkMode
                          ? 'bg-slate-900/80 border-slate-850 shadow-slate-950/20'
                          : 'bg-white border-slate-200 shadow-xs'
                          }`}
                      >
                        <div className={`p-3 flex justify-between items-center ${isDarkMode ? 'bg-slate-950 border-b border-slate-850' : 'bg-slate-900'} text-white`}>
                          <div>
                            <h4 className="text-sm font-black">TABLE {order.tableNumber}</h4>
                            <div className="text-[10px] text-amber-400 mt-0.5 font-mono">Token: {order.tokenNo} | Bill: {order.billNo}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 font-mono">{order.time}</span>
                            <button
                              onClick={() => deleteActiveOrder(order.id)}
                              className="text-slate-400 hover:text-rose-400 transition-colors p-1.5 rounded-md hover:bg-slate-800/50"
                              title="Delete Order"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        <div className="p-3 flex-grow">
                          <ul className="space-y-2">
                            {order.items?.map((it, idx) => (
                              <li key={idx} className={`flex justify-between text-xs border-b pb-1.5 transition-colors ${isDarkMode ? 'border-slate-850' : 'border-slate-50'}`}>
                                <span className={`font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{it.name}</span>
                                <span className={`px-1.5 py-0.5 font-bold rounded ${isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-800'}`}>x{it.quantity}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className={`p-2 border-t flex ${isDarkMode ? 'bg-slate-950/40 border-slate-850/80' : 'bg-slate-50 border-slate-100'}`}>
                          <button
                            onClick={() => handlePrint(order)}
                            className={`w-full text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-1 transition-colors border ${isDarkMode
                              ? 'bg-slate-800 text-white border-slate-700 hover:bg-slate-750'
                              : 'bg-slate-800 text-white hover:bg-slate-700 border-transparent'
                              }`}
                          >
                            <Printer size={12} /> Print Bill
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {kitchenSubView === 'inventory' && userRole === 'owner' && (
              <div className={`rounded-xl border p-6 shadow-md max-w-3xl mx-auto space-y-6 transition-all duration-300 ${isDarkMode
                ? 'bg-slate-900/60 border-slate-850 shadow-slate-950/20'
                : 'bg-white border-slate-200 shadow-xs'
                }`}>
                <div className={`border rounded-xl p-3 space-y-2 transition-all duration-300 ${isDarkMode
                  ? 'bg-slate-950/40 border-slate-850'
                  : 'bg-slate-50 border-slate-200'
                  }`}>
                  <span className="text-[10px] font-black text-slate-400 tracking-wider uppercase flex items-center gap-1"><Filter size={10} /> Filter Inventory View By Category</span>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                    {MENU_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => { setActiveInventoryCategory(cat); setEditingItemId(null); }}
                        className={`px-3 py-1.5 rounded-lg font-bold text-[11px] transition-all duration-200 border whitespace-nowrap uppercase ${activeInventoryCategory === cat
                          ? isDarkMode
                            ? 'bg-slate-800 text-white border-slate-700 shadow-sm'
                            : 'bg-slate-900 text-white border-transparent shadow-xs'
                          : isDarkMode
                            ? 'bg-slate-900/60 text-slate-400 border-slate-850 hover:bg-slate-850 hover:text-white'
                            : 'bg-white text-slate-650 border-slate-200 hover:bg-slate-100'
                          }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`border-b pb-3 flex flex-col sm:flex-row justify-between items-center gap-3 transition-colors ${isDarkMode ? 'border-slate-850' : 'border-slate-100'
                  }`}>
                  <h2 className={`text-base sm:text-xl font-black tracking-tight uppercase flex items-center gap-2 flex-wrap ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    <span>Menu Layout Inventory ({activeInventoryCategory})</span>
                    <span className="text-[10px] normal-case tracking-normal font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-450 border border-emerald-500/20">
                      Owner Profile
                    </span>
                  </h2>
                  <button
                    onClick={() => setIsAddFormOpen(!isAddFormOpen)}
                    className={`text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1 shadow-sm transition-all duration-200 ${isDarkMode
                      ? 'bg-emerald-500 hover:bg-emerald-450 text-slate-950'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                  >
                    <Plus size={14} /> {isAddFormOpen ? 'Close Form' : 'Add New Item'}
                  </button>
                </div>

                {isAddFormOpen && (
                  <form
                    onSubmit={handleAddItem}
                    className={`p-4 rounded-xl mb-6 space-y-3 text-xs border ${isDarkMode
                      ? 'bg-slate-950/60 border-slate-850'
                      : 'bg-slate-50 border-slate-200'
                      }`}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input
                        type="text"
                        required
                        placeholder="Item Name *"
                        value={newItemName}
                        onChange={e => setNewItemName(e.target.value)}
                        className={`w-full border p-2 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 ${isDarkMode
                          ? 'bg-slate-900 border-slate-800 text-white focus:ring-slate-700 focus:border-slate-700'
                          : 'bg-white border-slate-200 text-slate-900 focus:ring-slate-400 focus:border-slate-400'
                          }`}
                      />
                      <input
                        type="text"
                        placeholder="Serial No."
                        value={newItemSerial}
                        onChange={e => setNewItemSerial(e.target.value)}
                        className={`w-full border p-2 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 ${isDarkMode
                          ? 'bg-slate-900 border-slate-800 text-white focus:ring-slate-700 focus:border-slate-700'
                          : 'bg-white border-slate-200 text-slate-900 focus:ring-slate-400 focus:border-slate-400'
                          }`}
                      />
                      <input
                        type="number"
                        required
                        placeholder="Price (₹) *"
                        value={newItemPrice}
                        onChange={e => setNewItemPrice(e.target.value)}
                        className={`w-full border p-2 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 ${isDarkMode
                          ? 'bg-slate-900 border-slate-800 text-white focus:ring-slate-700 focus:border-slate-700'
                          : 'bg-white border-slate-200 text-slate-900 focus:ring-slate-400 focus:border-slate-400'
                          }`}
                      />
                      <select
                        value={newItemCategory}
                        onChange={e => setNewItemCategory(e.target.value)}
                        className={`w-full border p-2 rounded-lg h-9 text-xs font-semibold focus:outline-none ${isDarkMode
                          ? 'bg-slate-900 border-slate-800 text-white'
                          : 'bg-white border-slate-200 text-slate-900'
                          }`}
                      >
                        {MENU_CATEGORIES.map(cat => (<option key={cat} value={cat}>{cat}</option>))}
                      </select>
                    </div>
                    <textarea
                      placeholder="Description"
                      value={newItemDescription}
                      onChange={e => setNewItemDescription(e.target.value)}
                      className={`w-full border p-2 rounded-lg h-16 resize-none text-xs font-semibold focus:outline-none ${isDarkMode
                        ? 'bg-slate-900 border-slate-800 text-white focus:border-slate-700'
                        : 'bg-white border-slate-200 text-slate-900 focus:border-slate-400'
                        }`}
                    />
                    <button
                      type="submit"
                      className={`w-full font-bold py-2.5 rounded-lg transition-colors border ${isDarkMode
                        ? 'bg-emerald-500 hover:bg-emerald-450 border-emerald-500 text-slate-950 shadow-sm'
                        : 'bg-slate-900 hover:bg-slate-850 border-transparent text-white shadow-xs'
                        }`}
                    >
                      Confirm & Save
                    </button>
                  </form>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {menuItems.filter(item => item.category === activeInventoryCategory).map((item) => {
                    const isEditing = editingItemId === item.id;
                    const serialLabel = `#${getItemSerial(item)}`;

                    return (
                      <div
                        key={item.id}
                        className={`p-4 rounded-xl border flex flex-col justify-between gap-3 shadow-md transition-all duration-300 ${isDarkMode
                          ? 'bg-slate-900/30 border-slate-850/80 hover:bg-slate-900/50 hover:border-slate-800'
                          : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50 hover:shadow-xs'
                          }`}
                      >
                        {isEditing ? (
                          /* Expanded Edit Mode Form Fields */
                          <div className="space-y-2 text-xs w-full">
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <div>
                                <label className="text-[10px] font-black text-slate-400 block mb-1">EDIT SERIAL NO.</label>
                                <input
                                  type="text"
                                  value={editSerial}
                                  onChange={e => setEditSerial(e.target.value)}
                                  className={`w-full border p-2 rounded-lg font-bold uppercase ${isDarkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
                                    }`}
                                  placeholder="e.g. 101"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-black text-slate-400 block mb-1">CURRENT SERIAL</label>
                                <div className={`w-full border p-2 rounded-lg font-semibold ${isDarkMode ? 'bg-slate-900/60 border-slate-850 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-650'
                                  }`}>{serialLabel}</div>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Serial {serialLabel}</span>
                              <div>
                                <label className="text-[10px] font-black text-slate-400 block mb-1">EDIT DISH NAME</label>
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={e => setEditEditName(e.target.value)}
                                  className={`w-full border p-2 rounded-lg font-bold uppercase ${isDarkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
                                    }`}
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-slate-400 block mb-1">EDIT COST (₹)</label>
                              <input
                                type="number"
                                value={editPrice}
                                onChange={e => setEditPrice(e.target.value)}
                                className={`w-full border p-2 rounded-lg font-mono font-bold ${isDarkMode ? 'bg-slate-950 border-slate-800 text-emerald-400' : 'bg-white border-slate-200 text-emerald-600'
                                  }`}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-slate-400 block mb-1">EDIT DESCRIPTION</label>
                              <textarea
                                value={editDescription}
                                onChange={e => setEditDescription(e.target.value)}
                                className={`w-full border p-2 rounded-lg h-14 resize-none leading-tight ${isDarkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
                                  }`}
                              />
                            </div>
                          </div>
                        ) : (
                          /* Standard Layout Output Row Display */
                          <div className="min-w-0">
                            <div className="mb-2">
                              <span className="block text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Serial {serialLabel}</span>
                            </div>
                            <p className={`font-extrabold text-base uppercase truncate tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>{item.name}</p>
                            <p className="text-slate-400 text-xs leading-tight mt-1 line-clamp-2 h-8">{item.description || 'No custom details added yet.'}</p>
                            <div className="flex items-center gap-2 mt-2">
                              {item.serial && (
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide ${isDarkMode ? 'bg-slate-800/80 text-slate-300' : 'bg-slate-100 text-slate-700'
                                  }`}>#{item.serial}</span>
                              )}
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide ${isDarkMode ? 'bg-slate-850 text-slate-400' : 'bg-slate-200 text-slate-600'
                                }`}>{item.category}</span>
                              <span className={`text-sm font-mono font-black ${isDarkMode ? 'text-emerald-450' : 'text-emerald-600'}`}>₹{item.price}</span>
                            </div>
                          </div>
                        )}

                        <div className={`flex items-center justify-between border-t pt-2.5 mt-1 gap-2 w-full shrink-0 transition-colors ${isDarkMode ? 'border-slate-850/80' : 'border-slate-100'
                          }`}>
                          {isEditing ? (
                            /* Save or Cancel Editing Command Strings */
                            <>
                              <button
                                onClick={() => setEditingItemId(null)}
                                className={`text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1 transition-colors ${isDarkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-750' : 'bg-slate-200 text-slate-600 hover:bg-slate-250'
                                  }`}
                              >
                                <X size={12} /> Cancel
                              </button>
                              <button
                                onClick={() => handleUpdateItem(item.id)}
                                className={`text-xs font-black px-4 py-2 rounded-lg flex items-center gap-1 shadow-sm transition-all duration-200 ${isDarkMode ? 'bg-emerald-500 hover:bg-emerald-450 text-slate-950' : 'bg-emerald-600 text-white'
                                  }`}
                              >
                                <Check size={12} /> Save Changes
                              </button>
                            </>
                          ) : (
                            /* Availability, Custom Editing, and Removal Controls */
                            <>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => toggleItemAvailability(item.id)}
                                  className={`px-3 py-1.5 rounded-lg font-bold text-[11px] flex items-center gap-1 shadow-xs transition-all duration-200 border ${item.isAvailable
                                    ? isDarkMode
                                      ? 'bg-emerald-500/15 text-emerald-450 border-emerald-500/20 hover:bg-emerald-500/25'
                                      : 'bg-emerald-600 border-transparent text-white hover:bg-emerald-700'
                                    : isDarkMode
                                      ? 'bg-slate-950 text-slate-550 border-slate-900 line-through'
                                      : 'bg-slate-200 border-transparent text-slate-400 line-through hover:bg-slate-250'
                                    }`}
                                >
                                  {item.isAvailable ? <Eye size={12} /> : <EyeOff size={12} />}{item.isAvailable ? 'In Stock' : 'Hidden'}
                                </button>
                                <button
                                  onClick={() => startEditingItem(item)}
                                  className={`border p-2 rounded-lg transition-colors shadow-xs ${isDarkMode
                                    ? 'bg-slate-900 border-slate-800 text-slate-350 hover:bg-slate-800 hover:text-white'
                                    : 'bg-white border-slate-205 text-slate-600 hover:bg-slate-100'
                                    }`}
                                  title="Edit cost/details"
                                >
                                  <Edit2 size={13} />
                                </button>
                              </div>
                              <button
                                onClick={() => handleRemoveItem(item.id, item.name)}
                                className={`p-2 rounded-lg transition-colors shadow-xs border ${isDarkMode
                                  ? 'bg-rose-500/10 border-rose-500/20 text-rose-450 hover:bg-rose-500/20'
                                  : 'bg-rose-50 border-rose-100 text-rose-600 hover:bg-rose-100'
                                  }`}
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {menuItems.filter(item => item.category === activeInventoryCategory).length === 0 && (
                    <p className="text-slate-400 text-center text-xs py-4 col-span-2">No items listed inside this category yet.</p>
                  )}
                </div>
              </div>
            )}

            {kitchenSubView === 'analytics' && userRole === 'owner' && (
              <div className={`rounded-xl border p-6 shadow-md max-w-4xl mx-auto transition-all duration-300 ${isDarkMode
                ? 'bg-slate-900/60 border-slate-850 shadow-slate-950/20'
                : 'bg-white border-slate-200 shadow-xs'
                }`}>
                <div className={`flex justify-between items-center mb-6 pb-4 border-b ${isDarkMode ? 'border-slate-850' : 'border-slate-200'
                  }`}>
                  <div>
                    <h2 className={`text-2xl font-black uppercase flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      <span>Sales Analytics</span>
                      <span className="text-[10px] normal-case tracking-normal font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Owner Profile
                      </span>
                    </h2>
                    <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Completed orders and item sales</p>
                  </div>
                  <button
                    onClick={openExportModal}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-black text-xs px-5 py-3 rounded-lg flex items-center gap-1.5 shadow-sm transition-all duration-200"
                  >
                    <Download size={14} /> Download
                  </button>
                </div>

                <div className={`mb-6 border rounded-xl p-4 transition-colors ${isDarkMode ? 'bg-slate-950/60 border-slate-850' : 'bg-slate-50 border-slate-200'
                  }`}>
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="flex-1 min-w-0 w-full">
                      <label className={`font-black text-sm uppercase ${isDarkMode ? 'text-slate-350' : 'text-slate-700'}`}>Select Date</label>
                      <input
                        type="date"
                        value={selectedAnalyticsDate.split('/').reverse().join('-')}
                        onChange={(e) => { const parts = e.target.value.split('-'); setSelectedAnalyticsDate(`${parts[2]}/${parts[1]}/${parts[0]}`); }}
                        className={`w-full border rounded-lg px-4 py-2 font-semibold text-sm focus:outline-none focus:ring-1 ${isDarkMode
                          ? 'bg-slate-900 border-slate-800 text-white focus:ring-slate-700 focus:border-slate-700'
                          : 'bg-white border-slate-300 text-slate-850 focus:ring-slate-400 focus:border-slate-400'
                          }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0 w-full">
                      <div className={`text-xs font-black uppercase ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Export Range</div>
                      <div className="mt-1 text-slate-500 text-xs">Click Download to choose start and end dates.</div>
                    </div>
                  </div>
                </div>

                {completedOrders.filter(order => order.date === selectedAnalyticsDate).length === 0 ? (
                  <div className={`rounded-xl border-2 border-dashed p-12 text-center transition-colors ${isDarkMode ? 'border-slate-850 bg-slate-900/10' : 'border-slate-200 bg-slate-50'
                    }`}>
                    <p className={`text-sm ${isDarkMode ? 'text-slate-550' : 'text-slate-500'}`}>No completed orders for {selectedAnalyticsDate}.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className={`border rounded-xl p-4 transition-colors ${isDarkMode ? 'bg-emerald-500/10 border-emerald-550/20' : 'bg-emerald-50 border border-emerald-200'
                        }`}>
                        <div className={`text-xs font-black uppercase ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Orders</div>
                        <div className={`text-3xl font-black ${isDarkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                          {completedOrders.filter(order => order.date === selectedAnalyticsDate).length}
                        </div>
                      </div>
                      <div className={`border rounded-xl p-4 transition-colors ${isDarkMode ? 'bg-blue-500/10 border-blue-550/20' : 'bg-blue-50 border border-blue-200'
                        }`}>
                        <div className={`text-xs font-black uppercase ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Items Sold</div>
                        <div className={`text-3xl font-black ${isDarkMode ? 'text-blue-400' : 'text-blue-700'}`}>
                          {getAnalyticsData().reduce((sum, item) => sum + item.totalQty, 0)}
                        </div>
                      </div>
                      <div className={`border rounded-xl p-4 transition-colors ${isDarkMode ? 'bg-amber-500/10 border-amber-550/20' : 'bg-amber-50 border border-amber-200'
                        }`}>
                        <div className={`text-xs font-black uppercase ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Revenue</div>
                        <div className={`text-3xl font-black ${isDarkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                          ₹{getAnalyticsData().reduce((sum, item) => sum + item.totalRevenue, 0).toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div className={`border rounded-xl overflow-x-auto transition-colors ${isDarkMode ? 'bg-slate-950/40 border-slate-850' : 'bg-slate-50 border border-slate-200'
                      }`}>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className={isDarkMode ? 'bg-slate-900 border-b border-slate-800 text-slate-200' : 'bg-slate-900 text-white'}>
                            <th className="px-4 py-2.5 text-left font-black">Item</th>
                            <th className="px-4 py-2.5 text-left font-black text-xs uppercase">Category</th>
                            <th className="px-4 py-2.5 text-right font-black">Price</th>
                            <th className="px-4 py-2.5 text-right font-black">Qty</th>
                            <th className="px-4 py-2.5 text-right font-black">Revenue</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y transition-colors ${isDarkMode ? 'divide-slate-850' : 'divide-slate-200'}`}>
                          {getAnalyticsData().map((item, idx) => (
                            <tr key={idx} className={`transition-colors ${isDarkMode ? 'hover:bg-slate-900/60' : 'hover:bg-slate-100'}`}>
                              <td className={`px-4 py-2.5 font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-900'}`}>{item.itemName}</td>
                              <td className="px-4 py-2.5 text-xs uppercase text-slate-400 font-medium">{item.category}</td>
                              <td className="px-4 py-2.5 text-right">
                                <div className="inline-flex items-center justify-end gap-1.5">
                                  <span className={isDarkMode ? 'text-slate-250 font-mono' : 'text-slate-700 font-mono'}>₹{item.price.toFixed(2)}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteAnalyticsItem(item.itemName)}
                                    className={`transition-colors p-1 rounded-md ${isDarkMode ? 'text-slate-500 hover:text-rose-450 hover:bg-slate-800' : 'text-slate-400 hover:text-rose-600 hover:bg-slate-100'
                                      }`}
                                    title={`Delete ${item.itemName}`}
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </div>
                              </td>
                              <td className={`px-4 py-2.5 text-right font-black ${isDarkMode ? 'text-blue-400' : 'text-blue-700'}`}>{item.totalQty}</td>
                              <td className={`px-4 py-2.5 text-right font-black ${isDarkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>₹{item.totalRevenue.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {kitchenSubView === 'qrcodes' && userRole === 'owner' && (
              <div className={`rounded-xl border p-6 shadow-md max-w-5xl mx-auto space-y-6 transition-all duration-300 ${isDarkMode
                ? 'bg-slate-900/60 border-slate-850 shadow-slate-950/20'
                : 'bg-white border-slate-200 shadow-xs'
                }`}>
                <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b ${isDarkMode ? 'border-slate-850' : 'border-slate-150'
                  }`}>
                  <div>
                    <h2 className={`text-xl sm:text-2xl font-extrabold tracking-tight uppercase flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      <span>Table QR Codes</span>
                      <span className="text-[10px] normal-case tracking-normal font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-450 border border-emerald-500/20">
                        Owner Profile
                      </span>
                    </h2>
                    <p className={`text-sm mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-505'}`}>Generate and print labels for Tables 1 to 10. Scanning automatically enters and locks the table number for the customer.</p>
                  </div>
                  <button
                    onClick={handlePrintQrs}
                    className={`font-black text-xs px-5 py-3 rounded-lg flex items-center gap-1.5 shadow-sm transition-all duration-200 ${isDarkMode
                      ? 'bg-emerald-500 hover:bg-emerald-450 text-slate-950 shadow-emerald-950/20'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                  >
                    <Printer size={14} /> Print All QR Codes
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {[...Array.from({ length: 10 }, (_, i) => ({ id: `${i + 1}`, label: `TABLE ${i + 1}` })), { id: 'parcel', label: 'PARCEL ORDER' }].map((qrItem) => {
                    const tableUrl = `${window.location.origin}/?table=${qrItem.id}`;
                    const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(tableUrl)}`;
                    return (
                      <div
                        key={qrItem.id}
                        className={`border rounded-2xl p-4 flex flex-col items-center justify-between text-center transition-all duration-300 ${isDarkMode
                          ? 'bg-[#070913]/70 border-white/[0.04] shadow-md hover:border-slate-800'
                          : 'bg-slate-50/50 border-slate-150 hover:shadow-xs hover:border-slate-350'
                          }`}
                      >
                        <div className="w-full">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-200/60 text-slate-700'
                            }`}>
                            {qrItem.label}
                          </span>
                          <div className="my-4 flex justify-center bg-white p-2 rounded-xl border border-slate-100 shadow-inner">
                            <img src={qrImgUrl} alt={`${qrItem.label} QR`} className="w-28 h-28 object-contain" />
                          </div>
                          <p className={`text-[9px] truncate tracking-wide font-mono px-1 select-all ${isDarkMode ? 'text-slate-500' : 'text-slate-400'
                            }`} title={tableUrl}>
                            {tableUrl}
                          </p>
                        </div>
                        <div className="w-full mt-4 flex gap-1.5">
                          <button
                            onClick={() => handlePrintSingleQr(qrItem.id)}
                            className={`w-full py-1.5 rounded-lg font-bold text-[10px] flex items-center justify-center gap-1 transition-colors border ${isDarkMode
                              ? 'bg-slate-850 border-slate-800 text-slate-300 hover:bg-slate-800'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-2xs'
                              }`}
                          >
                            <Printer size={10} /> Print
                          </button>
                          <a
                            href={qrImgUrl}
                            download={`${qrItem.id}_qr.png`}
                            target="_blank"
                            rel="noreferrer"
                            className={`w-full py-1.5 rounded-lg font-bold text-[10px] flex items-center justify-center gap-1 transition-colors border text-center ${isDarkMode
                              ? 'bg-slate-850 border-slate-800 text-slate-300 hover:bg-slate-800'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-2xs'
                              }`}
                          >
                            <Download size={10} /> Download
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="bg-[#0c0d14] py-10 text-center text-slate-400 border-t border-white/[0.03] print:hidden relative z-10">
        <div className="max-w-7xl mx-auto px-4 flex flex-col items-center justify-center gap-3">
          <div className="flex items-center justify-center gap-1.5">
            <span className="text-xl leading-none">🍽️</span>
            <span className="text-xl font-bold tracking-wide text-[#dfba88] font-serif">
              Harsha Restaurant
            </span>
          </div>
          <p className="text-xs text-slate-400/90 max-w-md font-medium tracking-wide">
            Premium Multi-Cuisine Veg & Non-Veg Dining Hospitality
          </p>
          <p className="text-[11px] text-slate-400/80 max-w-sm font-medium tracking-wide -mt-1 leading-relaxed">
            Railway Station Rd, near DEVI CHOWK, Anaparthy, Anai, Andhra Pradesh 533342
          </p>
          <div className="text-xs font-semibold text-slate-400 tracking-wide mt-0.5">
            Contact & Orders: <span className="font-extrabold text-white">+91 9494123888</span>
          </div>
          <p className="text-[10px] text-slate-600 tracking-widest font-semibold mt-4">
            &copy; 2026 Harsha Restaurant. All Rights Reserved.
          </p>
        </div>
      </footer>

      {activePrintOrder && (
        <div id="harsha-thermal-receipt" className="hidden print:block">
          <div style={{ textAlign: 'center', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '15px', width: '100%' }}>Harsha Restaurant</div>
          <div style={{ textAlign: 'center', fontSize: '10px', lineHeight: '1.3', fontWeight: 'bold' }}>Opp, Government Hospital,<br />Main Road , Anaparthi.<br />GST IN: 37AHIPN7374F2ZX</div>
          <div style={{ margin: '4px 0', borderBottom: '1px dashed #000' }}></div>
          <table style={{ width: '100%', fontSize: '12px', fontWeight: 'bold' }}>
            <tbody>
              <tr><td style={{ textAlign: 'left', width: '50%' }}>Date: {activePrintOrder.date}</td><td style={{ textAlign: 'right', width: '50%', fontWeight: 'bold' }}>TABLE: {activePrintOrder.tableNumber}</td></tr>
              <tr><td style={{ textAlign: 'left', width: '50%' }}>Time: {activePrintOrder.time}</td><td style={{ textAlign: 'right', width: '50%', fontWeight: 'bold' }}>Bill No.: {activePrintOrder.billNo}</td></tr>
              <tr><td style={{ textAlign: 'left', width: '50%' }}>Token No.: {activePrintOrder.tokenNo}</td><td style={{ textAlign: 'right', width: '50%', fontWeight: 'bold' }}>Cashier: {userRole === 'owner' ? 'owner' : 'staff'}</td></tr>
            </tbody>
          </table>
          <div style={{ margin: '4px 0', borderBottom: '1px dashed #000' }}></div>
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', fontWeight: 'bold' }}>
            <thead>
              <tr>
                <th style={{ width: '8%', fontWeight: 'bold' }}>No.</th>
                <th style={{ width: '44%', fontWeight: 'bold' }}>Item</th>
                <th className="item-qty" style={{ fontWeight: 'bold' }}>Qty.</th>
                <th className="item-price" style={{ fontWeight: 'bold' }}>Price</th>
                <th className="item-amount" style={{ fontWeight: 'bold' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {activePrintOrder.items?.map((item, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td className="item-name">{item.name}</td>
                  <td className="item-qty">{item.quantity}</td>
                  <td className="item-price">{item.price?.toFixed(2)}</td>
                  <td className="item-amount">{(item.price * item.quantity).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ margin: '4px 0', borderBottom: '1px dashed #000' }}></div>
          <table style={{ width: '100%', fontSize: '12px', fontWeight: 'bold' }}>
            <tbody>
              <tr><td>Total Qty: {activePrintOrder.items?.reduce((sum, i) => sum + i.quantity, 0)}</td><td style={{ textAlign: 'right' }}>Sub Total</td><td style={{ textAlign: 'right' }}>{activePrintOrder.items?.reduce((sum, i) => sum + (i.price * i.quantity), 0).toFixed(2)}</td></tr>
              <tr style={{ fontWeight: 'bold', fontSize: '14px' }}><td></td><td style={{ textAlign: 'right' }}>Grand Total</td><td style={{ textAlign: 'right' }}>₹{activePrintOrder.items?.reduce((sum, i) => sum + (i.price * i.quantity), 0).toFixed(2)}</td></tr>
            </tbody>
          </table>
          <div style={{ margin: '6px 0 4px 0', borderBottom: '1px dashed #000' }}></div>
          <div style={{ display: 'block', textAlign: 'center', fontSize: '13px', fontWeight: 'bold', width: '100%', margin: '15px 0 5px 0' }}>Thanks & Visit Again</div>
        </div>
      )}

      {(isPrintingQrs || printSingleTableId !== null) && (
        <div id="harsha-qr-print" className="hidden print:block bg-white text-black min-h-screen p-6 font-sans">
          <style>{`
            @media print {
              body {
                background: white !important;
                color: black !important;
              }
              .page-break-avoid {
                page-break-inside: avoid;
                break-inside: avoid;
              }
            }
          `}</style>
          {printSingleTableId !== null ? (
            <div className="max-w-xs mx-auto border-4 border-double border-slate-400 rounded-3xl p-8 flex flex-col items-center justify-center text-center bg-white text-black mt-20">
              <div className="flex items-center gap-2 mb-4">
                <img src="/logo.png" alt="Logo" className="w-10 h-10 rounded-full border border-slate-200" />
                <span className="text-lg font-black font-serif tracking-wider text-slate-800">HARSHA RESTAURANT</span>
              </div>
              <div className="border border-slate-250 rounded-2xl p-4 bg-white mb-4 shadow-sm">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`${window.location.origin}/?table=${printSingleTableId}`)}`}
                  alt={`${printSingleTableId === 'parcel' ? 'Parcel Order' : `Table ${printSingleTableId}`} QR`}
                  className="w-48 h-48"
                />
              </div>
              <h3 className="text-3xl font-black tracking-tight text-slate-900">
                {printSingleTableId === 'parcel' ? 'PARCEL ORDER' : `TABLE ${printSingleTableId}`}
              </h3>
              <p className="text-xs text-slate-500 font-extrabold tracking-widest mt-2 uppercase">Scan to Order Fresh &amp; Delicious Food</p>
            </div>
          ) : (
            <div>
              <div className="text-center mb-6 border-b-2 border-slate-200 pb-3">
                <h2 className="text-xl font-bold tracking-tight uppercase">Harsha Restaurant - QR Codes</h2>
                <p className="text-xs text-slate-500">Scan to place instant order</p>
              </div>
              <div className="grid grid-cols-2 gap-6">
                {[...Array.from({ length: 10 }, (_, i) => ({ id: `${i + 1}`, label: `TABLE ${i + 1}` })), { id: 'parcel', label: 'PARCEL ORDER' }].map((qrItem) => {
                  const tableUrl = `${window.location.origin}/?table=${qrItem.id}`;
                  const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(tableUrl)}`;
                  return (
                    <div key={qrItem.id} className="page-break-avoid border-2 border-slate-350 rounded-2xl p-5 flex flex-col items-center justify-center text-center bg-white text-black shadow-xs">
                      <div className="flex items-center gap-1.5 mb-3">
                        <img src="/logo.png" alt="Logo" className="w-7 h-7 rounded-full border border-slate-200" />
                        <span className="text-xs font-black font-serif tracking-wider text-slate-800">HARSHA RESTAURANT</span>
                      </div>
                      <div className="border border-slate-100 rounded-xl p-3 bg-white mb-3 shadow-xs">
                        <img src={qrImgUrl} alt={`${qrItem.label} QR`} className="w-32 h-32" />
                      </div>
                      <h3 className="text-lg font-black tracking-tight text-slate-900">{qrItem.label}</h3>
                      <p className="text-[9px] text-slate-500 font-black tracking-widest mt-1 uppercase">Scan to Order Fresh &amp; Delicious Food</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {isAuthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs" onClick={() => { setIsAuthModalOpen(false); setPinInput(''); }} />
          <div className={`rounded-xl max-w-xs w-[calc(100%-2rem)] mx-4 p-5 relative z-10 shadow-xl border transition-all duration-300 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-800'
            }`}>
            <h3 className="text-sm font-bold text-center">Enter KDS Passcode</h3>
            <form onSubmit={handleVerifyPin} className="mt-3 space-y-3">
              <input
                autoFocus
                ref={pinInputRef}
                type="password"
                required
                maxLength={4}
                placeholder="••••"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                className={`w-full text-center tracking-widest border py-2 rounded-lg font-bold text-lg focus:outline-none ${isDarkMode
                  ? 'bg-slate-950 border-slate-800 text-white focus:border-emerald-500'
                  : 'bg-slate-50 border-slate-200 text-slate-850 focus:border-emerald-500'
                  }`}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setIsAuthModalOpen(false); setPinInput(''); }}
                  className={`w-1/2 py-2 rounded-lg text-xs font-semibold border transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-750 text-slate-300 hover:bg-slate-750' : 'bg-slate-100 border-transparent text-slate-600 hover:bg-slate-150'
                    }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`w-1/2 py-2 rounded-lg text-xs font-bold shadow-sm transition-all duration-200 ${isDarkMode
                    ? 'bg-emerald-500 hover:bg-emerald-450 text-slate-950 shadow-emerald-950/20'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                >
                  Verify
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs" onClick={() => setIsExportModalOpen(false)} />
          <div className={`rounded-xl max-w-md w-[calc(100%-2rem)] mx-4 p-6 relative z-10 shadow-xl border transition-all duration-300 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-800'
            }`}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight">Export Sales Report</h3>
                <p className="text-slate-400 text-xs mt-1">Select a start and end date for the export range.</p>
              </div>
              <button onClick={() => setIsExportModalOpen(false)} className="text-slate-400 hover:text-slate-200 transition-colors">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="font-black text-xs uppercase text-slate-400">Start Date</label>
                <input
                  type="date"
                  value={exportRangeStart}
                  onChange={(e) => setExportRangeStart(e.target.value)}
                  className={`mt-2 w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 ${isDarkMode
                    ? 'bg-slate-950 border-slate-800 text-white focus:ring-slate-700 focus:border-slate-700'
                    : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-slate-400 focus:border-slate-400'
                    }`}
                />
              </div>
              <div>
                <label className="font-black text-xs uppercase text-slate-400">End Date</label>
                <input
                  type="date"
                  value={exportRangeEnd}
                  onChange={(e) => setExportRangeEnd(e.target.value)}
                  className={`mt-2 w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 ${isDarkMode
                    ? 'bg-slate-950 border-slate-800 text-white focus:ring-slate-700 focus:border-slate-700'
                    : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-slate-400 focus:border-slate-400'
                    }`}
                />
              </div>
            </div>
            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleResetExportRange}
                className={`text-xs font-bold uppercase px-3 py-2 rounded-lg flex items-center gap-2 border transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-750 text-slate-350 hover:bg-slate-750' : 'bg-slate-100 border-transparent text-slate-650 hover:bg-slate-150'
                  }`}
              >
                <span className="text-sm">✕</span>
                <span>Reset</span>
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsExportModalOpen(false)}
                  className={`text-xs font-bold uppercase px-4 py-2 rounded-lg border transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-750 text-slate-350 hover:bg-slate-750' : 'bg-slate-100 border-transparent text-slate-600 hover:bg-slate-150'
                    }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExportSalesReport}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase px-4 py-2 rounded-lg shadow-sm transition-all duration-200"
                >
                  Export
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#070913]/60 backdrop-blur-md" onClick={() => setIsCartOpen(false)} />
          <div className={`rounded-2xl max-w-md w-[calc(100%-2rem)] mx-4 max-h-[82vh] flex flex-col shadow-2xl border overflow-hidden relative z-10 transition-all duration-300 ${isDarkMode
            ? 'bg-[#0f1322]/95 border-white/[0.08] backdrop-blur-2xl text-slate-100'
            : 'bg-white/95 border-slate-200/80 backdrop-blur-2xl text-slate-800 shadow-slate-200/20'
            }`}>
            <div className={`px-4 py-4 flex justify-between items-center border-b transition-colors duration-300 ${isDarkMode ? 'bg-[#070913]/90 border-white/[0.06]' : 'bg-[#f8fafc] border-slate-200/80'
              }`}>
              <h3 className={`text-xs font-extrabold uppercase tracking-widest ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Your Table Order</h3>
              <button
                onClick={() => setIsCartOpen(false)}
                className={`p-1 rounded-lg transition-all ${isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                  }`}
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex-grow overflow-y-auto px-4 py-4 space-y-3">
              {cart.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-xs text-slate-400 font-medium">Your cart is empty</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-3 rounded-xl text-xs border transition-colors ${isDarkMode ? 'bg-slate-950/40 border-white/[0.04] text-slate-250' : 'bg-slate-50 border-slate-200/60 text-slate-800 shadow-2xs'
                      }`}
                  >
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className={`font-extrabold truncate uppercase text-xs ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{item.name}</h4>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'text-slate-550 hover:text-rose-450 hover:bg-slate-900' : 'text-slate-400 hover:text-rose-600 hover:bg-slate-100'
                            }`}
                          title="Remove item"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`font-bold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>₹{item.price * item.quantity}</span>
                        <span className="text-[10px] text-slate-400 font-medium">({item.quantity} x ₹{item.price})</span>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          onClick={() => updateQuantity(item.id, -1)}
                          className={`w-6 h-6 rounded-md flex items-center justify-center border font-bold transition-all duration-200 ${isDarkMode ? 'bg-slate-950 border-slate-850 text-white hover:bg-slate-900' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:shadow-2xs'
                            }`}
                        >
                          -
                        </button>
                        <span className="font-extrabold font-mono px-2 text-xs">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.id, 1)}
                          className={`w-6 h-6 rounded-md flex items-center justify-center border font-bold transition-all duration-200 ${isDarkMode ? 'bg-slate-950 border-slate-850 text-white hover:bg-slate-900' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:shadow-2xs'
                            }`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && (
              <form
                onSubmit={handlePlaceOrder}
                className={`p-4 space-y-3.5 border-t transition-colors duration-300 ${isDarkMode ? 'bg-[#070913]/90 border-white/[0.06]' : 'bg-[#f8fafc] border-slate-200/85'
                  }`}
              >
                {currentView !== 'parcel' && (
                  <div className="space-y-1">
                    <input
                      type="number"
                      required
                      disabled={isTableLocked}
                      min="1"
                      max="10"
                      placeholder="Your Table Number *"
                      value={tableNumber}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          setTableNumber('');
                          setTableError('');
                          return;
                        }
                        const num = parseInt(val, 10);
                        if (!isNaN(num)) {
                          if (num > 10) {
                            setTableError('Table number cannot exceed 10!');
                            showToast('⚠️ Table number cannot exceed 10!');
                            return;
                          }
                          if (num < 1) {
                            setTableError('Table number must be between 1 and 10!');
                            showToast('⚠️ Table number must be between 1 and 10!');
                            return;
                          }
                          setTableError('');
                          setTableNumber(num.toString());
                        }
                      }}
                      className={`w-full border px-3 py-2.5 rounded-xl text-xs font-bold focus:outline-none transition-all duration-200 ${isTableLocked
                        ? isDarkMode
                          ? 'bg-[#0d1024] border-white/[0.04] text-slate-400 cursor-not-allowed opacity-80'
                          : 'bg-slate-100/95 border-slate-200 text-slate-600 cursor-not-allowed font-extrabold font-mono text-sm'
                        : isDarkMode
                          ? 'bg-[#070913] border-white/[0.08] text-white focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/50'
                          : 'bg-white border-slate-200/80 text-slate-950 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                        }`}
                    />
                    {tableError && (
                      <p className="text-[10px] font-bold text-rose-500 px-1 animate-pulse">
                        ⚠️ {tableError}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex justify-between font-extrabold text-sm px-0.5">
                  <span className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>Total Amount</span>
                  <span className={isDarkMode ? 'text-emerald-400 font-mono text-base' : 'text-emerald-600 font-mono text-base'}>₹{cartTotal}</span>
                </div>
                <button
                  type="submit"
                  className={`w-full font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-1 shadow-md transition-all duration-300 ${isDarkMode
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-450 hover:to-teal-450 text-slate-950 shadow-emerald-950/30 hover:scale-[1.01] active:scale-[0.99]'
                    : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-md shadow-emerald-500/10 hover:scale-[1.01] active:scale-[0.99]'
                    }`}
                >
                  {currentView === 'parcel' ? 'Send Parcel to Kitchen →' : 'Send Order to Kitchen →'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}